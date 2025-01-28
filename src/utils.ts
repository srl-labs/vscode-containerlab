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
 * If path is absolute, return it.
 * If starts with '~', expand it.
 * If relative, do a best guess approach.
 */
export function normalizeLabPath(labPath: string, singleFolderBase?: string): string {
    if (!labPath) {
        // console.debug(`normalizeLabPath: received empty labPath`);
        return labPath;
    }

    const originalInput = labPath;
    labPath = path.normalize(labPath);

    if (path.isAbsolute(labPath)) {
        // console.debug(`normalizeLabPath => absolute: ${originalInput} => ${labPath}`);
        return labPath;
    }

    if (labPath.startsWith('~')) {
        const homedir = os.homedir();
        const sub = labPath.replace(/^~[\/\\]?/, '');
        const expanded = path.normalize(path.join(homedir, sub));
        // console.debug(`normalizeLabPath => tilde expansion: ${originalInput} => ${expanded}`);
        return expanded;
    }

    // If truly relative, we do our best guess approach
    let candidatePaths: string[] = [];
    if (singleFolderBase) {
        candidatePaths.push(path.normalize(path.resolve(singleFolderBase, labPath)));
    }
    candidatePaths.push(path.normalize(path.resolve(process.cwd(), labPath)));

    for (const candidate of candidatePaths) {
        // console.debug(`normalizeLabPath => checking if path exists: ${candidate}`);
        if (fs.existsSync(candidate)) {
            // console.debug(`normalizeLabPath => found existing path: ${candidate}`);
            return candidate;
        }
    }

    const chosen = candidatePaths[0];
    // console.debug(`normalizeLabPath => no candidate path found on disk, fallback to: ${chosen}`);
    return chosen;
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
    const sudo = vscode.workspace.getConfiguration("containerlab").get<boolean>("sudoEnabledByDefault", true) ? "sudo " : "";
    // console.trace();
    console.log(`[getSudo]: Returning: "${sudo}"`);
    return sudo;
}