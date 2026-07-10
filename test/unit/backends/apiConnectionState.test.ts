/* global after, describe, it */
import * as http from "http";
import { once } from "events";
import Module from "module";
import path from "path";

import { expect } from "chai";

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  if (request === "vscode") {
    return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { ApiContainerlabBackend } from "../../../src/backends/api/apiContainerlabBackend";

function createApiServer(): http.Server {
  return http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    switch (request.url) {
      case "/api/v1/session":
        response.end(JSON.stringify({ username: "test", roles: [] }));
        return;
      case "/api/v1/capabilities":
        response.end(
          JSON.stringify({
            apiVersion: "v1",
            serverVersion: "test",
            runtime: "docker",
            features: []
          })
        );
        return;
      case "/api/v1/labs":
        response.end("{}");
        return;
      default:
        response.statusCode = 404;
        response.end(JSON.stringify({ error: "not found" }));
    }
  });
}

async function listen(server: http.Server, port = 0): Promise<number> {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return address.port;
}

async function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  server.close();
  await once(server, "close");
}

describe("ApiContainerlabBackend connection state", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("transitions offline after shutdown and reconnects after recovery", async () => {
    let server = createApiServer();
    const port = await listen(server);
    const backend = new ApiContainerlabBackend(
      {
        globalStorageUri: { fsPath: "/tmp/vscode-containerlab-liveness-test" },
        secrets: {
          get: async () => "test-token",
          store: async () => {},
          delete: async () => {}
        },
        workspaceState: {
          get: (_key: string, fallback: unknown) => fallback,
          update: async () => {}
        }
      } as any,
      {
        url: `http://127.0.0.1:${port}`,
        username: "test",
        allowInsecureHttp: false,
        unverifiedTlsConfirmed: false,
        verifyTls: true,
        pollIntervalMs: 60_000
      }
    );

    try {
      const initialized = await backend.initialize();
      expect(initialized.authenticated).to.equal(true);
      expect(backend.getConnectionState()).to.equal("connected");
      backend.dispose();

      await close(server);
      try {
        await backend.refreshRuntimeSnapshot();
        throw new Error("Expected refresh to fail while the API server is stopped");
      } catch (error) {
        expect((error as Error).message).not.to.include("Expected refresh");
      }
      expect(backend.getConnectionState()).to.equal("offline");

      server = createApiServer();
      await listen(server, port);
      await backend.refreshRuntimeSnapshot();
      expect(backend.getConnectionState()).to.equal("connected");
    } finally {
      backend.dispose();
      if (server.listening) await close(server);
    }
  });
});
