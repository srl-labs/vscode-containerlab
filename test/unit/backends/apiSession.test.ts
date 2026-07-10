/* global describe, it */
import { expect } from "chai";

import { ApiSession } from "../../../src/backends/api/apiSession";

class MemorySecrets {
  readonly values = new Map<string, string>();

  get(key: string): Thenable<string | undefined> {
    return Promise.resolve(this.values.get(key));
  }

  store(key: string, value: string): Thenable<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Thenable<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  onDidChange = () => ({ dispose() {} });
}

describe("ApiSession", () => {
  it("stores only the returned JWT in SecretStorage", async () => {
    const secrets = new MemorySecrets();
    const requests: Array<{ method: string; path: string; body?: Buffer | string }> = [];
    const transport = {
      getBaseUrl: () => "https://api.example.test",
      requestJson: async (_method: string, _path: string, options: { body?: Buffer | string }) => {
        requests.push({ method: _method, path: _path, body: options.body });
        return { token: "jwt-secret" };
      }
    };
    const session = new ApiSession({ secrets } as never, transport as never, "alice");

    await session.signIn("alice", "linux-password", "7d");

    expect(await session.getToken()).to.equal("jwt-secret");
    expect([...secrets.values.values()]).to.deep.equal(["jwt-secret"]);
    expect([...secrets.values.values()]).not.to.include("linux-password");
    expect(String(requests[0]?.body)).to.include("linux-password");
    expect(JSON.parse(String(requests[0]?.body))).to.deep.equal({
      username: "alice",
      password: "linux-password",
      sessionDuration: "7d"
    });
  });

  it("deletes an expired JWT after validation returns unauthorized", async () => {
    const secrets = new MemorySecrets();
    const transport = {
      getBaseUrl: () => "https://api.example.test",
      requestJson: async (method: string, path: string) => {
        if (method === "POST") return { token: "expired" };
        const { ApiRequestError } = await import("../../../src/backends/api/apiTransport");
        throw new ApiRequestError(`GET ${path} failed`, 401);
      }
    };
    const session = new ApiSession({ secrets } as never, transport as never, "alice");
    await session.signIn("alice", "password");

    expect(await session.validate()).to.equal(false);
    expect(await session.getToken()).to.equal(undefined);
  });

  it("loads authenticated identity from the session endpoint", async () => {
    const secrets = new MemorySecrets();
    const paths: string[] = [];
    const transport = {
      getBaseUrl: () => "https://api.example.test",
      requestJson: async (method: string, path: string) => {
        paths.push(path);
        if (method === "POST") return { token: "valid" };
        return {
          username: "alice",
          roles: ["api-user", "superuser"],
          expiresAt: "2030-01-01T00:00:00Z"
        };
      }
    };
    const session = new ApiSession({ secrets } as never, transport as never, "alice");
    await session.signIn("alice", "password");

    expect(await session.validate()).to.equal(true);
    expect(paths).to.include("/api/v1/session");
    expect(session.getIdentity()).to.deep.equal({
      username: "alice",
      roles: ["api-user", "superuser"],
      expiresAt: "2030-01-01T00:00:00Z"
    });
  });

  it("uses the version endpoint only as a 404 compatibility fallback", async () => {
    const secrets = new MemorySecrets();
    const paths: string[] = [];
    const { ApiRequestError } = await import("../../../src/backends/api/apiTransport");
    const transport = {
      getBaseUrl: () => "https://api.example.test",
      requestJson: async (method: string, path: string) => {
        paths.push(path);
        if (method === "POST") return { token: "legacy-valid" };
        if (path === "/api/v1/session") throw new ApiRequestError("not found", 404);
        return { version: "legacy" };
      }
    };
    const session = new ApiSession({ secrets } as never, transport as never, "alice");
    await session.signIn("alice", "password");

    expect(await session.validate()).to.equal(true);
    expect(paths.slice(-2)).to.deep.equal(["/api/v1/session", "/api/v1/version"]);
    expect(session.getIdentity()).to.deep.equal({ username: "alice", roles: [] });
  });
});
