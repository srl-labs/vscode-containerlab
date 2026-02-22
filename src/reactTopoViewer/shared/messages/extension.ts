/**
 * Types of postMessage commands that target the extension.
 * Used by the message router.
 */

/** Lifecycle commands */
export const LIFECYCLE_COMMANDS = {
  DEPLOY_LAB: "deployLab",
  DESTROY_LAB: "destroyLab",
  REDEPLOY_LAB: "redeployLab",
  DEPLOY_LAB_CLEANUP: "deployLabCleanup",
  DESTROY_LAB_CLEANUP: "destroyLabCleanup",
  REDEPLOY_LAB_CLEANUP: "redeployLabCleanup"
} as const;

export const MSG_CANCEL_LAB_LIFECYCLE = "cancelLabLifecycle" as const;

const LIFECYCLE_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(LIFECYCLE_COMMANDS));

export type LifecycleCommand = (typeof LIFECYCLE_COMMANDS)[keyof typeof LIFECYCLE_COMMANDS];

export function isLifecycleCommand(command: string): command is LifecycleCommand {
  return LIFECYCLE_COMMANDS_SET.has(command);
}

/** Node commands */
export const NODE_COMMANDS = {
  NODE_CONNECT_SSH: "clab-node-connect-ssh",
  NODE_ATTACH_SHELL: "clab-node-attach-shell",
  NODE_VIEW_LOG: "clab-node-view-logs"
} as const;

const NODE_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(NODE_COMMANDS));

export type NodeCommand = (typeof NODE_COMMANDS)[keyof typeof NODE_COMMANDS];

export function isNodeCommand(command: string): command is NodeCommand {
  return NODE_COMMANDS_SET.has(command);
}

/** Interface commands */
export const INTERFACE_COMMANDS = {
  INTERFACE_CAPTURE: "clab-interface-capture",
  LINK_IMPAIRMENT: "clab-link-impairment"
} as const;

const INTERFACE_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(INTERFACE_COMMANDS));

export type InterfaceCommand = (typeof INTERFACE_COMMANDS)[keyof typeof INTERFACE_COMMANDS];

export function isInterfaceCommand(command: string): command is InterfaceCommand {
  return INTERFACE_COMMANDS_SET.has(command);
}

/** Custom node commands */
export const CUSTOM_NODE_COMMANDS = {
  SAVE_CUSTOM_NODE: "save-custom-node",
  DELETE_CUSTOM_NODE: "delete-custom-node",
  SET_DEFAULT_CUSTOM_NODE: "set-default-custom-node"
} as const;

const CUSTOM_NODE_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(CUSTOM_NODE_COMMANDS));

export type CustomNodeCommand = (typeof CUSTOM_NODE_COMMANDS)[keyof typeof CUSTOM_NODE_COMMANDS];

export function isCustomNodeCommand(command: string): command is CustomNodeCommand {
  return CUSTOM_NODE_COMMANDS_SET.has(command);
}

/** Icon commands */
export const ICON_COMMANDS = {
  ICON_LIST: "icon-list",
  ICON_UPLOAD: "icon-upload",
  ICON_DELETE: "icon-delete",
  ICON_RECONCILE: "icon-reconcile"
} as const;

const ICON_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(ICON_COMMANDS));

export type IconCommand = (typeof ICON_COMMANDS)[keyof typeof ICON_COMMANDS];

export function isIconCommand(command: string): command is IconCommand {
  return ICON_COMMANDS_SET.has(command);
}

/** Export commands */
export const EXPORT_COMMANDS = {
  EXPORT_SVG_GRAFANA_BUNDLE: "export-svg-grafana-bundle"
} as const;

const EXPORT_COMMANDS_SET: ReadonlySet<string> = new Set(Object.values(EXPORT_COMMANDS));

export type ExportCommand = (typeof EXPORT_COMMANDS)[keyof typeof EXPORT_COMMANDS];

export function isExportCommand(command: string): command is ExportCommand {
  return EXPORT_COMMANDS_SET.has(command);
}

export const MSG_TOGGLE_SPLIT_VIEW = "topo-toggle-split-view" as const;

export type ExtensionCommandType =
  | LifecycleCommand
  | NodeCommand
  | InterfaceCommand
  | CustomNodeCommand
  | IconCommand
  | ExportCommand
  | typeof MSG_TOGGLE_SPLIT_VIEW
  | typeof MSG_CANCEL_LAB_LIFECYCLE;
