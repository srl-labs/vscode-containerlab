export const calls: string[] = [];
let output = '';
export function setOutput(out: string) {
  output = out;
}
export async function runWithSudo(command: string, ..._args: any[]): Promise<string> {
  calls.push(command);
  void _args;
  return output;
}
