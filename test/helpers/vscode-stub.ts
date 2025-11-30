export const window = {
  lastErrorMessage: '',
  lastInfoMessage: '',
  createOutputChannel(_name: string, options?: { log: boolean } | string) {
    const isLogChannel = typeof options === 'object' && options?.log;
    return {
      appendLine() {},
      show() {},
      // LogOutputChannel methods (when { log: true } is passed)
      ...(isLogChannel && {
        info() {},
        debug() {},
        warn() {},
        error() {},
        trace() {},
      }),
    };
  },
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
  onDidSaveTextDocument(cb: any) {
    if (typeof cb === 'function') {
      // no-op
    }
    return { dispose() {} };
  },
  fs: {
    readFile: async () => new TextEncoder().encode('{}'),
  },
};

export const Uri = {
  file(p: string) {
    return { fsPath: p };
  },
  joinPath(...parts: any[]) {
    return { fsPath: parts.map(p => (typeof p === 'string' ? p : p.fsPath)).join('/') };
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

export class ThemeColor {
  public id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class ThemeIcon {
  static readonly File = 'file';
  public id: string;
  public color?: ThemeColor;
  constructor(id: string, color?: ThemeColor) {
    this.id = id;
    this.color = color;
  }
}

export const ViewColumn = {
  One: 1,
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

export const extensions = {
  getExtension(_extensionId: string) {
    return {
      packageJSON: {
        version: '0.0.0-test',
      },
    };
  },
};

export class EventEmitter<T> {
  private listeners: Array<(e: T) => any> = [];

  get event(): (listener: (e: T) => any) => { dispose(): void } {
    return (listener: (e: T) => any) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const idx = this.listeners.indexOf(listener);
          if (idx >= 0) {
            this.listeners.splice(idx, 1);
          }
        },
      };
    };
  }

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}
