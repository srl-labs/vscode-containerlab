export const calls: string[] = [];
let output = "";

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
    userGroups: ["clab_admins", "docker"],
    username: "testuser",
    uid: 1000
  };
}

export async function getSelectedLabNode(node?: any): Promise<any> {
  // In tests, always return the node that was passed in
  return node;
}

/**
 * Stub for normalizeLabPath - just returns the path as-is for testing
 */
export function normalizeLabPath(labPath: string, _singleFolderBase?: string): string {
  return labPath;
}

/**
 * Stub for getRelLabFolderPath - returns the relative folder path from workspace
 * In tests, workspace is typically '/workspace', so we strip that prefix and the filename
 */
export function getRelLabFolderPath(labPath: string): string {
  // Strip /workspace/ prefix if present (test workspace root)
  let relativePath = labPath;
  if (relativePath.startsWith("/workspace/")) {
    relativePath = relativePath.substring("/workspace/".length);
  }
  // Strip the filename
  const lastSlash = relativePath.lastIndexOf("/");
  if (lastSlash === -1) return "";
  return relativePath.substring(0, lastSlash);
}
