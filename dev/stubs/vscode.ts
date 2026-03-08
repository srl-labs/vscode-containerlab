type ContributedExtension = {
  packageJSON?: unknown;
};

export const extensions = {
  all: [] as ContributedExtension[]
};

export const commands = {
  async executeCommand<T>(_command: string, ..._args: unknown[]): Promise<T | undefined> {
    return undefined;
  }
};
