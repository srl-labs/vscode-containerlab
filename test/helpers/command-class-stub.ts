export const instances: any[] = [];
export type CmdOptions = { command: string; useSpinner: boolean; terminalName?: string; spinnerMsg?: any };
export class Command {
  public options: CmdOptions;
  public executedArgs: string[] | undefined;
  constructor(options: CmdOptions) {
    this.options = options;
    instances.push(this);
  }
  execute(args?: string[]): Promise<void> {
    this.executedArgs = args;
    return Promise.resolve();
  }
}
