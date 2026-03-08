/* global describe, it */
import { expect } from "chai";

import type { ExplorerAction } from "../../../src/webviews/shared/explorer/types";
import { resolveQuickActionsForNode } from "../../../src/webviews/explorer/quickActions";

function createAction(commandId: string, label?: string): ExplorerAction {
  return {
    id: `${commandId}:id`,
    actionRef: `${commandId}:ref`,
    label: label ?? commandId,
    commandId
  };
}

describe("resolveQuickActionsForNode", () => {
  it("returns SSH and Logs quick actions for container nodes", () => {
    const actions = [
      createAction("containerlab.node.showLogs", "Show Logs"),
      createAction("containerlab.node.ssh", "SSH"),
      createAction("containerlab.node.stop", "Stop")
    ];

    const quickActions = resolveQuickActionsForNode("containerlabContainer", actions);

    expect(quickActions.map((action) => action.commandId)).to.deep.equal([
      "containerlab.node.ssh",
      "containerlab.node.showLogs"
    ]);
  });

  it("includes first contributed container action as an inline quick action", () => {
    const actions = [
      createAction("containerlab.node.showLogs", "Show Logs"),
      createAction("containerlab.node.ssh", "SSH"),
      createAction("netconf.clabConnect", "NETCONF: Connect"),
      createAction("vendor.otherAction", "Other Action")
    ];

    const quickActions = resolveQuickActionsForNode("containerlabContainer", actions);

    expect(quickActions.map((action) => action.commandId)).to.deep.equal([
      "containerlab.node.ssh",
      "containerlab.node.showLogs",
      "netconf.clabConnect"
    ]);
  });

  it("does not add container quick actions for container groups", () => {
    const actions = [
      createAction("containerlab.node.showLogs", "Show Logs"),
      createAction("containerlab.node.ssh", "SSH")
    ];

    const quickActions = resolveQuickActionsForNode("containerlabContainerGroup", actions);

    expect(quickActions).to.deep.equal([]);
  });

  it("prefers local capture command for interfaces", () => {
    const actions = [
      createAction("containerlab.interface.capture", "Capture"),
      createAction("containerlab.interface.captureWithEdgeshark", "Capture With Edgeshark")
    ];

    const quickActions = resolveQuickActionsForNode("containerlabInterfaceUp", actions);

    expect(quickActions.map((action) => action.commandId)).to.deep.equal([
      "containerlab.interface.capture"
    ]);
  });

  it("falls back to edgeshark capture when local capture is unavailable", () => {
    const actions = [
      createAction("containerlab.interface.captureWithEdgeshark", "Capture With Edgeshark"),
      createAction("containerlab.interface.captureWithEdgesharkVNC", "Capture With Edgeshark VNC")
    ];

    const quickActions = resolveQuickActionsForNode("containerlabInterfaceDown", actions);

    expect(quickActions.map((action) => action.commandId)).to.deep.equal([
      "containerlab.interface.captureWithEdgeshark"
    ]);
  });
});
