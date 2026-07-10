/* global after, afterEach, beforeEach, describe, it */
import Module from "module";
import path from "path";

import { expect } from "chai";
import sinon from "sinon";

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
import {
  createWorkspaceBackend,
  registerBackend,
  resetActiveBackendForTests,
  setActiveBackend
} from "../../../src/backends/manager";
import { WorkspaceExplorerTreeDataProvider } from "../../../src/treeView/workspaceExplorerProvider";
import { ClabLabTreeNode } from "../../../src/treeView/common";
import type { ApiEndpointManagerState } from "../../../src/apiEndpoints/protocol";

const vscodeStub = require("../../helpers/vscode-stub");

class EventEmitterStub {
  event = () => ({ dispose() {} });
  fire() {}
  dispose() {}
}

function extensionContext() {
  return {
    globalStorageUri: { fsPath: "/tmp/vscode-containerlab-test" },
    secrets: {
      get: sinon.stub().resolves(undefined),
      store: sinon.stub().resolves(),
      delete: sinon.stub().resolves()
    },
    workspaceState: {
      get: (_key: string, fallback: unknown) => fallback,
      update: sinon.stub().resolves()
    }
  } as any;
}

function endpointState(
  backend: ApiContainerlabBackend,
  additionalEndpoints: ApiEndpointManagerState["endpoints"] = []
): ApiEndpointManagerState {
  const connection = backend.getConnectionInfo();
  return {
    defaultApiUrl: connection.url,
    tlsVerify: true,
    endpoints: [
      {
        id: "remote",
        label: "Remote Lab",
        url: connection.url,
        username: connection.username,
        sessionDuration: "24h",
        allowInsecureHttp: false,
        registered: true,
        connected: true,
        status: "connected"
      },
      ...additionalEndpoints
    ]
  };
}

describe("WorkspaceExplorerTreeDataProvider", () => {
  let backend: ApiContainerlabBackend;
  let connectionStateStub: sinon.SinonStub;

  beforeEach(() => {
    vscodeStub.EventEmitter = EventEmitterStub;
    setActiveBackend(createWorkspaceBackend());
    backend = new ApiContainerlabBackend(extensionContext(), {
      url: "https://api.example.test:8090",
      username: "test",
      allowInsecureHttp: false,
      unverifiedTlsConfirmed: false,
      verifyTls: true,
      pollIntervalMs: 5000
    });
    registerBackend(backend);
    connectionStateStub = sinon.stub(backend, "getConnectionState").returns("connected");
    sinon.stub(backend.operations, "listTopologies").resolves([
      {
        labName: "demo",
        yamlFileName: "labs/demo.clab.yml",
        annotationsFileName: "labs/demo.clab.yml.annotations.json",
        hasAnnotations: true,
        deploymentState: "undeployed"
      }
    ]);
  });

  afterEach(() => {
    resetActiveBackendForTests();
    sinon.restore();
  });

  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("shows local and API roots with separate running and undeployed groups", async () => {
    const state = endpointState(backend);
    const provider = new WorkspaceExplorerTreeDataProvider({
      getEndpointState: async () => state,
      runningProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any,
      localProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any
    });

    const roots = await provider.getChildren();
    expect(roots.map((root) => root.label)).to.deep.equal(["Local Workspace", "Remote Lab"]);
    expect(roots[0].contextValue).to.equal("containerlabLocalWorkspace");
    expect(roots[0].description).to.equal("");

    const apiSections = await provider.getChildren(roots[1]);
    expect(apiSections.map((section) => section.label)).to.deep.equal([
      "Running (0)",
      "Undeployed (1)"
    ]);
    const undeployed = await provider.getChildren(apiSections[1]);
    expect(undeployed).to.have.lengthOf(1);
    expect((undeployed[0] as any).labRef).to.deep.equal({
      backendId: backend.id,
      labName: "demo",
      remotePath: "labs/demo.clab.yml",
      sourceLabName: "demo",
      sourcePath: "labs/demo.clab.yml"
    });
    provider.dispose();
  });

  it("uses backend liveness instead of registration as endpoint status", async () => {
    connectionStateStub.returns("offline");
    const provider = new WorkspaceExplorerTreeDataProvider({
      getEndpointState: async () => endpointState(backend),
      runningProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any,
      localProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any
    });

    const roots = await provider.getChildren();
    expect((roots[1] as any).state).to.equal("offline");
    provider.dispose();
  });

  it("matches a managed topology to a differently named runtime lab by source path", async () => {
    (backend.operations.listTopologies as sinon.SinonStub).resolves([
      {
        labName: "srlinux-vlan-handling-lab",
        yamlFileName: "vlan.clab.yml",
        annotationsFileName: "vlan.clab.yml.annotations.json",
        hasAnnotations: true,
        deploymentState: "undeployed"
      }
    ]);
    const runningNode = new ClabLabTreeNode(
      "vlan",
      0 as any,
      { absolute: "", relative: "" },
      "vlan",
      undefined,
      undefined,
      "containerlabLabDeployed",
      false,
      undefined,
      undefined,
      {
        backendId: backend.id,
        labName: "vlan",
        remotePath: "/home/test/.clab/srlinux-vlan-handling-lab/vlan.clab.yml"
      }
    );
    const provider = new WorkspaceExplorerTreeDataProvider({
      getEndpointState: async () => endpointState(backend),
      runningProvider: {
        getChildren: async () => [runningNode],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any,
      localProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any
    });

    const roots = await provider.getChildren();
    const apiSections = await provider.getChildren(roots[1]);
    expect(apiSections.map((section) => section.label)).to.deep.equal([
      "Running (1)",
      "Undeployed (0)"
    ]);
    provider.dispose();
  });

  it("keeps saved disconnected endpoints visible", async () => {
    const state = endpointState(backend, [
      {
        id: "offline",
        label: "Offline Site",
        url: "https://offline.example.test:8090",
        username: "admin",
        sessionDuration: "24h",
        allowInsecureHttp: false,
        registered: false,
        connected: false,
        status: "offline"
      }
    ]);
    const provider = new WorkspaceExplorerTreeDataProvider({
      getEndpointState: async () => state,
      runningProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any,
      localProvider: {
        getChildren: async () => [],
        setTreeFilter() {},
        clearTreeFilter() {},
        onDidChangeTreeData: () => ({ dispose() {} })
      } as any
    });

    const roots = await provider.getChildren();
    const offlineRoot = roots.find((root) => root.label === "Offline Site");
    expect(offlineRoot).not.to.equal(undefined);
    const children = await provider.getChildren(offlineRoot!);
    expect(children.map((child) => child.label)).to.deep.equal(["Not connected"]);
    provider.dispose();
  });
});
