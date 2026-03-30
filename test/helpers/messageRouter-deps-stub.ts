export const log = {
  info() {},
  debug() {},
  warn() {},
  error() {}
};

export const MSG_CANCEL_LAB_LIFECYCLE = "cancel-lab-lifecycle";
export const MSG_CUSTOM_NODE_ERROR = "custom-node-error";
export const MSG_CUSTOM_NODE_UPDATED = "custom-node-updated";
export const MSG_ICON_LIST_RESPONSE = "icon-list-response";
export const MSG_LAB_LIFECYCLE_STATUS = "lab-lifecycle-status";
export const MSG_SVG_EXPORT_RESULT = "svg-export-result";
export const MSG_TOGGLE_SPLIT_VIEW = "toggle-split-view";

export function logWithLocation(_level: string, _message: string, _fileLine?: string): void {
  // no-op in tests
}

export const labLifecycleService = {
  async handleLabLifecycleEndpoint(_command: string, _yamlFilePath: string) {
    return { result: null, error: null };
  }
};

export const nodeFsAdapter = {
  async writeFile(_path: string, _content: string): Promise<void> {
    // no-op in tests
  }
};

export const nodeCommandService = {
  async handleNodeEndpoint(_command: string, _nodeName: string, _yamlFilePath: string) {
    return { result: null, error: null };
  },
  async handleInterfaceEndpoint(
    _command: string,
    _payload: { nodeName: string; interfaceName: string; data?: Record<string, unknown> },
    _yamlFilePath: string
  ) {
    return { result: null, error: null };
  }
};

export const customNodeConfigManager = {
  async saveCustomNode(_data: Record<string, unknown>) {
    return { result: { customNodes: [], defaultNode: "" }, error: null };
  },
  async deleteCustomNode(_name: string) {
    return { result: { customNodes: [], defaultNode: "" }, error: null };
  },
  async setDefaultCustomNode(_name: string) {
    return { result: { customNodes: [], defaultNode: "" }, error: null };
  }
};

export const iconService = {
  async loadAllIcons(_yamlFilePath: string): Promise<unknown[]> {
    return [];
  },
  async uploadIcon(): Promise<{ success: boolean }> {
    return { success: false };
  },
  async deleteGlobalIcon(_iconName: string): Promise<{ success: boolean }> {
    return { success: false };
  },
  async reconcileWorkspaceIcons(_yamlFilePath: string, _usedIcons: string[]): Promise<void> {
    // no-op in tests
  }
};

export function cancelActiveCommand(): boolean {
  return false;
}

export function isCustomNodeCommand(_command: unknown): boolean {
  return false;
}

export function isExportCommand(_command: unknown): boolean {
  return false;
}

export function isIconCommand(_command: unknown): boolean {
  return false;
}

export function isInterfaceCommand(_command: unknown): boolean {
  return false;
}

export function isLifecycleCommand(_command: unknown): boolean {
  return false;
}

export function isNodeCommand(_command: unknown): boolean {
  return false;
}

export async function handleTopologyHostProtocolMessage(args: {
  host?: { applyCommand?: (command: unknown, baseRevision: number) => Promise<Record<string, unknown>> };
  message: Record<string, unknown>;
  postMessage: (response: Record<string, unknown>) => void;
}): Promise<boolean> {
  if (args.message.type !== "topology-host:command" || args.host?.applyCommand === undefined) {
    return false;
  }

  const response = await args.host.applyCommand(
    args.message.command,
    typeof args.message.baseRevision === "number" ? args.message.baseRevision : 0
  );
  args.postMessage({
    ...response,
    requestId: args.message.requestId
  });
  return true;
}
