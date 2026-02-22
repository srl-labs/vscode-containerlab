/* global describe, it, before, after, afterEach */
import Module from "module";
import path from "path";

import { expect } from "chai";
import sinon from "sinon";
import type { MessageRouter as MessageRouterType } from "../../../src/reactTopoViewer/extension/panel/MessageRouter";

type MessageRouterCtor = typeof MessageRouterType;

type ModuleWithResolve = typeof Module & { _resolveFilename: Function };

const moduleWithResolve = Module as unknown as ModuleWithResolve;
const originalResolve = moduleWithResolve._resolveFilename;
const ROUTER_DEP_REQUESTS = new Set([
  "../services/logger",
  "../services/LabLifecycleService",
  "../../shared/io",
  "../services/NodeCommandService",
  "../services/CustomNodeConfigManager",
  "../services/IconService",
  "../../../commands/command"
]);

let MessageRouter: MessageRouterCtor;

describe("MessageRouter topology-host command parsing", () => {
  before(() => {
    moduleWithResolve._resolveFilename = function (
      request: string,
      parent: unknown,
      isMain: boolean,
      options: unknown
    ) {
      if (request === "vscode") {
        return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
      }
      if (ROUTER_DEP_REQUESTS.has(request)) {
        return path.join(__dirname, "..", "..", "helpers", "messageRouter-deps-stub.js");
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    MessageRouter = require("../../../src/reactTopoViewer/extension/panel/MessageRouter").MessageRouter;
  });

  after(() => {
    moduleWithResolve._resolveFilename = originalResolve;
  });

  afterEach(() => {
    sinon.restore();
  });

  for (const commandName of ["undo", "redo"] as const) {
    it(`accepts payload-less '${commandName}' command`, async () => {
      const applyCommand = sinon.stub().resolves({
        type: "topology-host:ack",
        protocolVersion: 1,
        requestId: "",
        revision: 11
      });
      const postMessage = sinon.spy();

      const router = new MessageRouter({
        yamlFilePath: "/tmp/test.clab.yml",
        isViewMode: false,
        splitViewManager: { toggleSplitView: async () => false } as never,
        topologyHost: { applyCommand } as never,
        setInternalUpdate: () => {}
      });

      await router.handleMessage(
        {
          type: "topology-host:command",
          requestId: "req-undo-redo",
          protocolVersion: 1,
          baseRevision: 7,
          command: { command: commandName }
        },
        { webview: { postMessage } } as never
      );

      expect(applyCommand.calledOnce).to.equal(true);
      expect(applyCommand.firstCall.args[0]).to.deep.equal({ command: commandName });
      expect(applyCommand.firstCall.args[1]).to.equal(7);

      expect(postMessage.calledOnce).to.equal(true);
      const response = postMessage.firstCall.args[0] as {
        type?: string;
        requestId?: string;
      };
      expect(response.type).to.equal("topology-host:ack");
      expect(response.requestId).to.equal("req-undo-redo");
    });
  }
});
