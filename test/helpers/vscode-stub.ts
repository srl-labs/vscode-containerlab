export const window = {
  lastErrorMessage: '',
  showErrorMessage(message: string) {
    this.lastErrorMessage = message;
  },
};

export const commands = {
  executed: [] as { command: string; args: any[] }[],
  executeCommand(command: string, ...args: any[]) {
    this.executed.push({ command, args });
    return Promise.resolve();
  },
};

export const Uri = {
  file(p: string) {
    return { fsPath: p };
  },
};
