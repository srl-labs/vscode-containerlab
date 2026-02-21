export const log = {
  info() {},
  debug() {},
  warn() {},
  error() {}
};

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
