/* global describe, it */
import { expect } from "chai";

import { ApiContainerlabOperations } from "../../../src/backends/api/apiOperations";
import type { ApiSession } from "../../../src/backends/api/apiSession";
import type { ClabApiTransport } from "../../../src/backends/api/apiTransport";

interface CapturedRequest {
  body?: string | Buffer;
  contentType?: string;
  method: string;
  path: string;
  token?: string;
}

function operationsFixture(jsonResponse: unknown = {}) {
  const requests: CapturedRequest[] = [];
  let errors = 0;
  let mutations = 0;
  let refreshes = 0;
  let successes = 0;
  const transport = {
    async requestJson(
      method: string,
      requestPath: string,
      options: CapturedRequest = { method, path: requestPath }
    ) {
      requests.push({ ...options, method, path: requestPath });
      if (jsonResponse instanceof Error) throw jsonResponse;
      return jsonResponse;
    },
    async requestText(
      method: string,
      requestPath: string,
      options: CapturedRequest = { method, path: requestPath }
    ) {
      requests.push({ ...options, method, path: requestPath });
      return "content";
    },
    async requestVoid(
      method: string,
      requestPath: string,
      options: CapturedRequest = { method, path: requestPath }
    ) {
      requests.push({ ...options, method, path: requestPath });
    }
  } as unknown as ClabApiTransport;
  const session = {
    async requireToken() {
      return "test-token";
    }
  } as ApiSession;
  const operations = new ApiContainerlabOperations({
    transport,
    session,
    onMutation: () => {
      mutations++;
    },
    onRequestError: () => {
      errors++;
    },
    onRequestSuccess: () => {
      successes++;
    },
    refreshRuntime: async () => {
      refreshes++;
    }
  });
  return {
    operations,
    requests,
    get errors() {
      return errors;
    },
    get mutations() {
      return mutations;
    },
    get refreshes() {
      return refreshes;
    },
    get successes() {
      return successes;
    }
  };
}

describe("ApiContainerlabOperations", () => {
  it("owns topology and workspace route construction", async () => {
    const fixture = operationsFixture([]);

    await fixture.operations.listTopologies();
    await fixture.operations.readWorkspaceFile("labs/demo config.txt");

    expect(fixture.requests).to.deep.include.members([
      {
        method: "GET",
        path: "/api/v1/labs/topology/files",
        token: "test-token"
      },
      {
        method: "GET",
        path: "/api/v1/labs/workspace/file?path=labs%2Fdemo+config.txt",
        token: "test-token"
      }
    ]);
  });

  it("uses the inventory file path for non-canonical topology documents", async () => {
    const fixture = operationsFixture();

    expect(
      await fixture.operations.readTopologyFile("srlinux-vlan-handling-lab", "vlan config.clab.yml")
    ).to.equal("content");
    await fixture.operations.writeTopologyFile(
      "srlinux-vlan-handling-lab",
      "vlan config.clab.yml.annotations.json",
      "{}"
    );

    expect(fixture.requests).to.deep.equal([
      {
        method: "GET",
        path: "/api/v1/labs/srlinux-vlan-handling-lab/topology/file?path=vlan+config.clab.yml",
        token: "test-token"
      },
      {
        method: "PUT",
        path: "/api/v1/labs/srlinux-vlan-handling-lab/topology/file?path=vlan+config.clab.yml.annotations.json",
        token: "test-token",
        body: "{}",
        contentType: "application/octet-stream"
      }
    ]);
    expect(fixture.mutations).to.equal(1);
  });

  it("refreshes runtime state after a node lifecycle mutation", async () => {
    const fixture = operationsFixture();

    await fixture.operations.controlNodeLifecycle("demo lab", "leaf/1", "restart");

    expect(fixture.requests[0]).to.deep.equal({
      method: "POST",
      path: "/api/v1/labs/demo%20lab/nodes/leaf%2F1/restart",
      token: "test-token",
      body: "{}",
      contentType: "application/json"
    });
    expect(fixture.refreshes).to.equal(1);
    expect(fixture.mutations).to.equal(1);
  });

  it("signals Explorer refreshes after API workspace writes", async () => {
    const fixture = operationsFixture();

    await fixture.operations.writeWorkspaceFile("labs/demo.clab.yml", "name: demo\n");

    expect(fixture.requests[0]).to.deep.equal({
      method: "PUT",
      path: "/api/v1/labs/workspace/file?path=labs%2Fdemo.clab.yml",
      token: "test-token",
      body: "name: demo\n",
      contentType: "application/octet-stream"
    });
    expect(fixture.mutations).to.equal(1);
  });

  it("reports request failures to backend liveness tracking", async () => {
    const fixture = operationsFixture(new Error("server unavailable"));

    try {
      await fixture.operations.listTopologies();
      throw new Error("Expected the API operation to fail");
    } catch (error) {
      expect((error as Error).message).to.equal("server unavailable");
    }

    expect(fixture.errors).to.equal(1);
    expect(fixture.successes).to.equal(0);
  });
});
