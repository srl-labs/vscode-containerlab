/* global describe, it */
import { expect } from "chai";

import { WorkspaceContainerlabBackend } from "../../../src/backends/workspaceBackend";
import type {
  BackendCapability,
  ContainerlabBackend,
  LabLifecycleRequest,
  RuntimeSnapshot
} from "../../../src/backends/types";
import type { ClabDetailedJSON, ClabLabTreeNode } from "../../../src/treeView/common";

function container(labName: string, shortId: string): ClabDetailedJSON {
  return {
    Names: [`clab-${labName}-node`],
    ID: shortId,
    ShortID: shortId,
    Image: "image",
    State: "running",
    Status: "running",
    Labels: {
      "clab-node-kind": "linux",
      "clab-node-lab-dir": "",
      "clab-node-longname": `clab-${labName}-node`,
      "clab-node-name": "node",
      "clab-owner": "test",
      "clab-topo-file": `/labs/${labName}.clab.yml`,
      containerlab: labName
    },
    NetworkSettings: {},
    Mounts: [],
    Ports: []
  };
}

function fakeBackend(
  id: string,
  kind: "local" | "api",
  snapshot: RuntimeSnapshot,
  capabilities: BackendCapability[] = ["runtime-inspect", "lab-lifecycle"]
): ContainerlabBackend & { lifecycleRequests: LabLifecycleRequest[]; disposed: boolean } {
  const lifecycleRequests: LabLifecycleRequest[] = [];
  const backend = {
    id,
    kind,
    capabilities: new Set(capabilities),
    lifecycleRequests,
    disposed: false,
    async initialize() {
      return { authenticated: true };
    },
    dispose() {
      backend.disposed = true;
    },
    async refreshRuntimeSnapshot() {
      return snapshot;
    },
    getRuntimeSnapshot() {
      return snapshot;
    },
    getInterfaceSnapshot() {
      return [{ name: id, interfaces: [] }];
    },
    getInterfaceVersion() {
      return 1;
    },
    isPollingMode() {
      return false;
    },
    resetPollingMode() {},
    onRuntimeDataChanged() {
      return () => {};
    },
    onContainerStateChanged() {
      return () => {};
    },
    async runLabLifecycle(request: LabLifecycleRequest) {
      lifecycleRequests.push(request);
    },
    cancelActiveOperation() {
      return false;
    },
    async isAuthenticated() {
      return true;
    },
    getAuthenticatedSession() {
      return kind === "api" ? { username: "test", roles: [] } : undefined;
    },
    getServerCapabilities() {
      return undefined;
    },
    resolveLabRef(resolvedLabName: string, runtimePath?: string) {
      return {
        backendId: id,
        labName: resolvedLabName,
        ...(kind === "local" && runtimePath !== undefined ? { localPath: runtimePath } : {}),
        ...(kind === "api" && runtimePath !== undefined ? { remotePath: runtimePath } : {})
      };
    },
    async rememberLabSource() {}
  };
  return backend;
}

describe("workspace backend router", () => {
  it("keeps same-name labs from independent backends in the combined snapshot", () => {
    const workspace = new WorkspaceContainerlabBackend();
    workspace.addBackend(
      fakeBackend("local", "local", { labs: { demo: [container("demo", "local-id")] } })
    );
    workspace.addBackend(
      fakeBackend("api:https://example.test#test", "api", {
        labs: { demo: [container("demo", "api-id")] }
      })
    );

    const labs = Object.values(workspace.getRuntimeSnapshot().labs);
    expect(labs).to.have.length(2);
    expect(labs.map((entries) => entries[0].Labels["clab-backend-id"])).to.have.members([
      "local",
      "api:https://example.test#test"
    ]);
  });

  it("routes lifecycle and interface reads to the owning backend", async () => {
    const workspace = new WorkspaceContainerlabBackend();
    const local = fakeBackend("local", "local", {
      labs: { demo: [container("demo", "same-id")] }
    });
    const api = fakeBackend("api:https://example.test#test", "api", {
      labs: { demo: [container("demo", "same-id")] }
    });
    workspace.addBackend(local);
    workspace.addBackend(api);
    const node = {
      labRef: { backendId: api.id, labName: "demo" }
    } as ClabLabTreeNode;
    const request = { action: "destroy", cleanup: false, node } as LabLifecycleRequest;

    await workspace.runLabLifecycle(request);

    expect(local.lifecycleRequests).to.be.empty;
    expect(api.lifecycleRequests).to.deep.equal([request]);
    expect(workspace.getInterfaceSnapshot("same-id", "", api.id)[0].name).to.equal(api.id);
  });

  it("removes only the requested backend and recomputes capabilities", () => {
    const workspace = new WorkspaceContainerlabBackend();
    const local = fakeBackend("local", "local", { labs: {} }, ["local-runtime"]);
    const api = fakeBackend("api:https://example.test#test", "api", { labs: {} }, ["api-auth"]);
    workspace.addBackend(local);
    workspace.addBackend(api);

    workspace.removeBackend(api.id);

    expect(api.disposed).to.equal(true);
    expect(local.disposed).to.equal(false);
    expect(workspace.capabilities.has("local-runtime")).to.equal(true);
    expect(workspace.capabilities.has("api-auth")).to.equal(false);
  });
});
