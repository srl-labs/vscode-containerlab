/* global after, describe, it */
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { once } from "events";
import Module from "module";

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
import type { LabLifecycleRequest } from "../../../src/backends/types";
import { ClabLabTreeNode } from "../../../src/treeView/common";

interface CapturedRequest {
  body: string;
  method: string;
  url: URL;
}

type ExecuteLifecycleRequest = (
  request: LabLifecycleRequest,
  token: string,
  signal: AbortSignal,
  onLine: (line: string, stream: "stdout" | "stderr") => void
) => Promise<void>;

async function listen(server: http.Server): Promise<number> {
  server.listen(0, "127.0.0.1");
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

function createBackend(storagePath: string, port: number): ApiContainerlabBackend {
  return new ApiContainerlabBackend(
    {
      globalStorageUri: { fsPath: storagePath },
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
}

describe("API-managed topology lifecycle routing", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("uses the remote path for deploy/apply and runtime name for destructive actions", async () => {
    const captured: CapturedRequest[] = [];
    const server = http.createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        captured.push({
          body,
          method: request.method ?? "",
          url: new URL(request.url ?? "/", "http://127.0.0.1")
        });
        response.setHeader("Content-Type", "application/x-ndjson");
        response.end(`${JSON.stringify({ type: "done", message: "ok" })}\n`);
      });
    });
    const port = await listen(server);
    const storagePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "vscode-containerlab-managed-lifecycle-")
    );
    const localPath = path.join(storagePath, "vlan.clab.yml");
    await fs.promises.writeFile(localPath, "name: vlan\ntopology:\n  nodes: {}\n", "utf8");
    const backend = createBackend(storagePath, port);
    const node = new ClabLabTreeNode(
      "srlinux-vlan-handling-lab",
      0 as any,
      { absolute: localPath, relative: "vlan.clab.yml" },
      undefined,
      undefined,
      undefined,
      "containerlabLabUndeployed",
      false,
      undefined,
      undefined,
      {
        backendId: backend.id,
        labName: "srlinux-vlan-handling-lab",
        localPath,
        remotePath: "vlan.clab.yml"
      }
    );
    const execute = Reflect.get(backend, "executeLifecycleRequest") as ExecuteLifecycleRequest;

    try {
      for (const action of ["deploy", "apply", "redeploy", "destroy"] as const) {
        await execute.call(
          backend,
          { action, cleanup: false, node },
          "test-token",
          new AbortController().signal,
          () => {}
        );
      }

      expect(captured).to.have.lengthOf(4);
      expect(captured[0].method).to.equal("POST");
      expect(captured[0].url.pathname).to.equal("/api/v1/labs/srlinux-vlan-handling-lab/deploy");
      expect(captured[0].url.searchParams.get("path")).to.equal("vlan.clab.yml");
      expect(captured[1].method).to.equal("POST");
      expect(captured[1].url.pathname).to.equal("/api/v1/labs/srlinux-vlan-handling-lab/apply");
      expect(captured[1].url.searchParams.get("path")).to.equal("vlan.clab.yml");
      expect(captured[2].method).to.equal("PUT");
      expect(captured[2].url.pathname).to.equal("/api/v1/labs/vlan");
      expect(captured[2].url.searchParams.get("path")).to.equal(null);
      expect(captured[3].method).to.equal("DELETE");
      expect(captured[3].url.pathname).to.equal("/api/v1/labs/vlan");
      expect(captured[3].body).to.equal("");
    } finally {
      backend.dispose();
      await close(server);
      await fs.promises.rm(storagePath, { force: true, recursive: true });
    }
  });
});
