/* global describe, it, beforeEach, after, afterEach */
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

import {
  buildExplorerSnapshot,
  invalidateExplorerContributionCache
} from "../../../src/webviews/explorer/explorerSnapshotAdapter";

const vscodeStub = require("../../helpers/vscode-stub");

function createProvider(rootItems: any[]): { getChildren: (element?: any) => any[] } {
  return {
    getChildren(element?: any) {
      if (element !== undefined && element !== null && Array.isArray(element.children)) {
        return element.children;
      }
      return rootItems;
    }
  };
}

function createContainerItem(label: string): any {
  return {
    label,
    contextValue: "containerlabContainer",
    collapsibleState: 0
  };
}

describe("explorerSnapshotAdapter contributed container actions", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    invalidateExplorerContributionCache();
    vscodeStub.extensions.all = [];
  });

  afterEach(() => {
    invalidateExplorerContributionCache();
    sinon.restore();
  });

  it("includes custom menu and legacy view/item/context contributions for container nodes", async () => {
    vscodeStub.extensions.all = [
      {
        packageJSON: {
          contributes: {
            commands: [
              { command: "acme.node.custom", title: "ACME: Custom Action", icon: "$(vm-connect)" },
              { command: "acme.node.legacy", title: "ACME: Legacy Action" },
              { command: "acme.node.ignore", title: "ACME: Ignore Action" }
            ]
          }
        }
      }
    ];

    sinon.stub(vscodeStub.commands, "executeCommand").callsFake((...args: any[]) => {
      const command = String(args[0]);
      const menuId = String(args[1] ?? "");
      if (command !== "_builtin.getContributedMenuItems") {
        return Promise.resolve(undefined);
      }

      if (menuId === "containerlab/node/context") {
        return Promise.resolve([{ command: "acme.node.custom" }]);
      }

      if (menuId === "view/item/context") {
        return Promise.resolve([
          { command: "acme.node.legacy", when: "viewItem == containerlabContainer" },
          { command: "acme.node.ignore", when: "viewItem == unrelatedItem" }
        ]);
      }

      return Promise.resolve([]);
    });

    const snapshotResult = await buildExplorerSnapshot(
      {
        runningProvider: createProvider([createContainerItem("node1")]) as any,
        localProvider: createProvider([]) as any,
        helpProvider: createProvider([]) as any
      },
      "",
      {
        hideNonOwnedLabs: false,
        isLocalCaptureAllowed: true
      }
    );

    const actions = snapshotResult.snapshot.sections[0]?.nodes[0]?.actions ?? [];
    const commandIds = actions.map((action) => action.commandId);

    expect(commandIds).to.include("containerlab.node.showLogs");
    expect(commandIds).to.include("acme.node.custom");
    expect(commandIds).to.include("acme.node.legacy");
    expect(commandIds).to.not.include("acme.node.ignore");
    const customAction = actions.find((action) => action.commandId === "acme.node.custom") as
      | ({ iconId?: string } & (typeof actions)[number])
      | undefined;
    expect(customAction?.label).to.equal("ACME: Custom Action");
    expect(customAction?.iconId).to.equal("vm-connect");
  });

  it("falls back to extension package contributions when builtin menu query is unavailable", async () => {
    vscodeStub.extensions.all = [
      {
        packageJSON: {
          contributes: {
            commands: [
              { command: "acme.node.pkg", title: "ACME: Package Action", icon: "$(plug)" },
              { command: "acme.node.pkgLegacy", title: "ACME: Package Legacy" },
              { command: "acme.node.skip", title: "ACME: Skip" }
            ],
            menus: {
              "containerlab/node/context": [{ command: "acme.node.pkg" }],
              "view/item/context": [
                { command: "acme.node.pkgLegacy", when: "viewItem == containerlabContainer" },
                { command: "acme.node.skip", when: "viewItem == fileExplorerItem" }
              ]
            }
          }
        }
      }
    ];

    sinon.stub(vscodeStub.commands, "executeCommand").callsFake((...args: any[]) => {
      const command = String(args[0]);
      if (command === "_builtin.getContributedMenuItems") {
        return Promise.reject(new Error("not available"));
      }
      return Promise.resolve(undefined);
    });

    const snapshotResult = await buildExplorerSnapshot(
      {
        runningProvider: createProvider([createContainerItem("node2")]) as any,
        localProvider: createProvider([]) as any,
        helpProvider: createProvider([]) as any
      },
      "",
      {
        hideNonOwnedLabs: false,
        isLocalCaptureAllowed: true
      }
    );

    const actions = snapshotResult.snapshot.sections[0]?.nodes[0]?.actions ?? [];
    const commandIds = actions.map((action) => action.commandId);

    expect(commandIds).to.include("acme.node.pkg");
    expect(commandIds).to.include("acme.node.pkgLegacy");
    expect(commandIds).to.not.include("acme.node.skip");
    const packageAction = actions.find((action) => action.commandId === "acme.node.pkg") as
      | ({ iconId?: string } & (typeof actions)[number])
      | undefined;
    expect(packageAction?.iconId).to.equal("plug");
  });
});
