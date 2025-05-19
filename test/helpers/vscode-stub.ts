export const window = {
  lastErrorMessage: '',
  lastInfoMessage: '',
  showErrorMessage(message: string) {
    this.lastErrorMessage = message;
  },
  showInformationMessage(message: string) {
    this.lastInfoMessage = message;
  },
};

export const commands = {
  executed: [] as { command: string; args: any[] }[],
  executeCommand(command: string, ...args: any[]) {
    this.executed.push({ command, args });
    return Promise.resolve();
  },
};

export const workspace = {
  workspaceFolders: [] as { uri: { fsPath: string }; name?: string }[],
  getConfiguration() {
    return {
      get: <T>(_: string, defaultValue?: T): T | undefined => defaultValue,
    };
  },
  updateWorkspaceFolders(
    index: number,
    deleteCount: number | null,
    ...folders: { uri: { fsPath: string }; name?: string }[]
  ) {
    const del = deleteCount ?? 0;
    this.workspaceFolders.splice(index, del, ...folders);
  },
};

export const Uri = {
  file(p: string) {
    return { fsPath: p };
  },
};

export class TreeItem {
  public iconPath: any;
  public label?: string;
  public collapsibleState?: number;
  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const;

export const ThemeIcon = {
  File: 'file',
};

export const env = {
  clipboard: {
    lastText: '',
    writeText(text: string) {
      this.lastText = text;
      return Promise.resolve();
    },
  },
};
