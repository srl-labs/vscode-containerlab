import type { ExplorerAction } from "../shared/explorer/types";

const CONTAINER_QUICK_ACTION_COMMANDS = ["containerlab.node.ssh", "containerlab.node.showLogs"];
const INTERFACE_CAPTURE_COMMANDS = [
  "containerlab.interface.capture",
  "containerlab.interface.captureWithEdgeshark",
  "containerlab.interface.captureWithEdgesharkVNC"
];

function actionByCommandId(
  actions: ExplorerAction[],
  commandId: string
): ExplorerAction | undefined {
  const normalizedCommand = commandId.toLowerCase();
  return actions.find((action) => action.commandId.toLowerCase() === normalizedCommand);
}

function isInterfaceContext(contextValue: string | undefined): boolean {
  return contextValue === "containerlabInterfaceUp" || contextValue === "containerlabInterfaceDown";
}

function isContainerlabCommand(commandId: string): boolean {
  return commandId.toLowerCase().startsWith("containerlab.");
}

function resolveContainerQuickActions(actions: ExplorerAction[]): ExplorerAction[] {
  const quickActions = CONTAINER_QUICK_ACTION_COMMANDS.map((commandId) =>
    actionByCommandId(actions, commandId)
  ).filter((action): action is ExplorerAction => action !== undefined);
  const usedCommandIds = new Set(quickActions.map((action) => action.commandId.toLowerCase()));
  const contributedQuickAction = actions.find((action) => {
    const commandId = action.commandId.toLowerCase();
    return !isContainerlabCommand(commandId) && !usedCommandIds.has(commandId);
  });
  if (contributedQuickAction !== undefined) {
    quickActions.push(contributedQuickAction);
  }
  return quickActions;
}

export function resolveQuickActionsForNode(
  contextValue: string | undefined,
  actions: ExplorerAction[]
): ExplorerAction[] {
  if (contextValue === "containerlabContainer") {
    return resolveContainerQuickActions(actions);
  }

  if (isInterfaceContext(contextValue)) {
    for (const commandId of INTERFACE_CAPTURE_COMMANDS) {
      const action = actionByCommandId(actions, commandId);
      if (action !== undefined) {
        return [action];
      }
    }
  }

  return [];
}
