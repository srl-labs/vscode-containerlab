export const calls: string[] = [];
let output = '';

export function setOutput(out: string) {
  output = out;
}

export async function runCommand(command: string, ..._args: any[]): Promise<string> {
  calls.push(command);
  if (_args.length > 0) {
    // no-op to consume args for linter
  }
  return output;
}

export function getUserInfo(): {
  hasPermission: boolean;
  isRoot: boolean;
  userGroups: string[];
  username: string;
  uid: number;
} {
  // In tests, always return that permissions are granted
  return {
    hasPermission: true,
    isRoot: false,
    userGroups: ['clab_admins', 'docker'],
    username: 'testuser',
    uid: 1000
  };
}

export async function getSelectedLabNode(node?: any): Promise<any> {
  // In tests, always return the node that was passed in
  return node;
}
