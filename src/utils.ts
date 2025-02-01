import * as vscode from "vscode";
import * as path from 'path';
import * as fs from "fs";
import * as os from "os";

export function stripAnsi(input: string): string {
    return input
        // First, remove all ESC [ <stuff> m sequences
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        // Remove any leftover single ESC or other escape codes
        .replace(/\x1B[@-Z\\-_]/g, "");
}

export function stripFileName(path: string): string {
    // remove stuff after the final '/' in the path
    return path.substring(0, path.lastIndexOf("/"));
}

export function getRelativeFolderPath(targetPath: string): string {
    const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.path : "";
    return path.relative(workspacePath, targetPath);
}

export function getRelLabFolderPath(labPath: string): string {
    return stripFileName(getRelativeFolderPath(labPath));
}

/**
 * Normalize a lab path by:
 *   1) Handling empty input
 *   2) Normalizing slashes
 *   3) Expanding ~ if present
 *   4) Handling relative paths (including optional singleFolderBase)
 *   5) Using realpathSync if the path exists, so symlinks or mount differences are resolved
 */
export function normalizeLabPath(labPath: string, singleFolderBase?: string): string {
    // 1) If empty, just return
    if (!labPath) {
      return labPath;
    }
  
    // 2) Normalize slashes (e.g. \ vs / on Windows)
    labPath = path.normalize(labPath);
  
    // 3) If the path starts with '~', expand to homedir
    //    e.g. '~' → '/home/bob'
    if (labPath.startsWith('~')) {
      const homedir = os.homedir();
      // Remove the tilde and any leading slash
      const sub = labPath.replace(/^~[\/\\]?/, '');
      const expanded = path.join(homedir, sub);
      // Re-normalize after expansion (in case the sub path has odd slashes)
      labPath = path.normalize(expanded);
    }
  
    // 4) If path is not yet absolute, handle relative:
    //    (a) relative to singleFolderBase if provided
    //    (b) otherwise relative to `process.cwd()`
    let candidatePaths: string[] = [];
    if (!path.isAbsolute(labPath)) {
      if (singleFolderBase) {
        // e.g. /some/base + labPath
        candidatePaths.push(path.resolve(singleFolderBase, labPath));
      }
      // always push a fallback candidate from current working dir
      candidatePaths.push(path.resolve(process.cwd(), labPath));
    } else {
      // It was already absolute—just push it as our sole candidate
      candidatePaths.push(labPath);
    }
  
    // 5) For each candidate path, check if it exists
    //    If so, call fs.realpathSync to resolve symlinks to a canonical path
    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        try {
          // Return the real, canonical path to avoid any symlink mismatch
          return fs.realpathSync(candidate);
        } catch (err) {
          // If realpathSync fails for some reason, just return the candidate
          return candidate;
        }
      }
    }
  
    // If none of the candidates exist, just return the first candidate
    // (this matches your original fallback behavior)
    return candidatePaths[0];
  }
/*
    Capitalise the first letter of a string
*/
export function titleCase(str: string) {
    return str[0].toLocaleUpperCase() + str.slice(1);
}

/**
 * Getter which checks the extension config on whether to use sudo or not.
 * If sudo is enabled, the sudo string will have a space at the end.
 * 
 * @returns A string which is either "sudo " or blank ("")
 */
export function getSudo() {
    const sudo = vscode.workspace.getConfiguration("containerlab").get<boolean>("sudoEnabledByDefault", false) ? "sudo " : "";
    // console.trace();
    console.log(`[getSudo]:\tReturning: "${sudo}"`);
    return sudo;
}