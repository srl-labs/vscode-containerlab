export const calls: string[] = [];
let output = '';

export function setOutput(out: string) {
  output = out;
}

export async function runWithSudo(command: string, ..._args: any[]): Promise<string> {
  calls.push(command);
  if (_args.length > 0) {
    // no-op to consume args for linter
  }
  return output;
}

export function getSudo() {
  return '';
}

export async function getSelectedLabNode(node?: any): Promise<any> {
  // In tests, always return the node that was passed in
  return node;
}
