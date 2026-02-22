export const instances: any[] = [];
export type CmdOptions = {
  command: string;
  useSpinner?: boolean;
  terminalName?: string;
  spinnerMsg?: any;
};
export class Command {
  public options: CmdOptions;
  public executedArgs: string[] | undefined;
  constructor(options: CmdOptions) {
    this.options = {
      command: options.command,
      useSpinner: options.useSpinner ?? false,
      terminalName: options.terminalName ?? "term",
      spinnerMsg: options.spinnerMsg
    };
    instances.push(this);
  }
  execute(args?: string[]): Promise<void> {
    this.executedArgs = args;
    return Promise.resolve();
  }
}
