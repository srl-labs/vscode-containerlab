/**
 * IconService - Manages custom icon loading, upload, and workspace synchronization.
 *
 * Icon resolution order (repo wins):
 * 1. Workspace .clab-icons/ folder (sibling to .clab.yml)
 * 2. Global ~/.clab/icons/ folder
 * 3. Built-in icons (handled separately by webview)
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as vscode from "vscode";

import type { CustomIconInfo } from "../../shared/types/icons";
import {
  getIconFormat,
  getIconMimeType,
  isBuiltInIcon,
  isSupportedIconExtension
} from "../../shared/types/icons";

import { log } from "./logger";

/**
 * Name of the workspace icons folder
 */
const WORKSPACE_ICONS_FOLDER = ".clab-icons";

/**
 * Global icons folder under user home
 */
const GLOBAL_ICONS_FOLDER = ".clab/icons";

/**
 * Result of an icon operation
 */
export interface IconOperationResult {
  success: boolean;
  error?: string;
  icons?: CustomIconInfo[];
}

/**
 * Service for managing custom icons in React TopoViewer
 */
export class IconService {
  /**
   * Get the global icons directory path
   */
  getGlobalIconDir(): string {
    return path.join(os.homedir(), GLOBAL_ICONS_FOLDER);
  }

  /**
   * Get the workspace icons directory path for a given YAML file
   */
  getWorkspaceIconDir(yamlFilePath: string): string {
    return path.join(path.dirname(yamlFilePath), WORKSPACE_ICONS_FOLDER);
  }

  /**
   * Sanitize a filename to create a valid icon name
   */
  sanitizeIconName(filename: string): string {
    // Remove extension and normalize
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    // Lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens
    let result = baseName
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-") // Replace non-alphanumeric chars
      .replace(/^-+/, ""); // Trim leading hyphens
    // Trim trailing hyphens safely (avoid super-linear regex)
    while (result.endsWith("-")) {
      result = result.slice(0, -1);
    }
    // Collapse multiple hyphens
    return result.replace(/-+/g, "-");
  }

  /**
   * Load a single icon file and convert to data URI
   */
  private async loadIconAsDataUri(filePath: string): Promise<string | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!isSupportedIconExtension(ext)) {
        return null;
      }

      const buffer = await fs.promises.readFile(filePath);
      const mimeType = getIconMimeType(ext);
      const base64 = buffer.toString("base64");
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      log.warn(`Failed to load icon ${filePath}: ${err}`);
      return null;
    }
  }

  /**
   * List icons from a directory
   */
  private async listIconsFromDir(
    dirPath: string,
    source: "workspace" | "global"
  ): Promise<CustomIconInfo[]> {
    const icons: CustomIconInfo[] = [];

    try {
      const exists = await this.pathExists(dirPath);
      if (!exists) {
        return icons;
      }

      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!isSupportedIconExtension(ext)) continue;

        const filePath = path.join(dirPath, entry.name);
        const dataUri = await this.loadIconAsDataUri(filePath);

        if (dataUri !== null && dataUri.length > 0) {
          const name = path.basename(entry.name, ext);
          icons.push({
            name,
            source,
            dataUri,
            format: getIconFormat(ext)
          });
        }
      }
    } catch (err) {
      log.warn(`Failed to list icons from ${dirPath}: ${err}`);
    }

    return icons;
  }

  /**
   * Load all available icons (workspace first, then global, deduplicated)
   * Resolution order: workspace wins over global for same-named icons
   */
  async loadAllIcons(yamlFilePath: string): Promise<CustomIconInfo[]> {
    const workspaceDir = this.getWorkspaceIconDir(yamlFilePath);
    const globalDir = this.getGlobalIconDir();

    // Load workspace icons first (they take priority)
    const workspaceIcons = await this.listIconsFromDir(workspaceDir, "workspace");

    // Load global icons
    const globalIcons = await this.listIconsFromDir(globalDir, "global");

    // Merge: workspace icons override global icons with same name
    const iconMap = new Map<string, CustomIconInfo>();

    // Add global icons first
    for (const icon of globalIcons) {
      iconMap.set(icon.name, icon);
    }

    // Override with workspace icons (repo wins)
    for (const icon of workspaceIcons) {
      iconMap.set(icon.name, icon);
    }

    return Array.from(iconMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Upload a new icon to the global icons directory
   */
  async uploadIcon(): Promise<IconOperationResult> {
    try {
      // Show file picker
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "Icon files": ["svg", "png"]
        },
        title: "Select Custom Icon"
      });

      if (!selection || selection.length === 0) {
        return { success: false, error: "No file selected" };
      }

      const sourceUri = selection[0];
      const ext = path.extname(sourceUri.fsPath).toLowerCase();

      if (!isSupportedIconExtension(ext)) {
        return { success: false, error: "Only SVG and PNG files are supported" };
      }

      // Ensure global icons directory exists
      const globalDir = this.getGlobalIconDir();
      await this.ensureDir(globalDir);

      // Generate unique filename
      const baseName = this.sanitizeIconName(path.basename(sourceUri.fsPath));
      const destFileName = await this.generateUniqueFileName(globalDir, baseName, ext);
      const destPath = path.join(globalDir, destFileName);

      // Copy file
      const content = await vscode.workspace.fs.readFile(sourceUri);
      await fs.promises.writeFile(destPath, Buffer.from(content));

      const iconName = path.basename(destFileName, ext);
      log.info(`Uploaded custom icon: ${iconName}`);
      void vscode.window.showInformationMessage(`Added custom icon "${iconName}"`);

      return { success: true };
    } catch (err) {
      const error = `Failed to upload icon: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      void vscode.window.showErrorMessage(error);
      return { success: false, error };
    }
  }

  /**
   * Delete an icon from the global icons directory
   */
  async deleteGlobalIcon(iconName: string): Promise<IconOperationResult> {
    try {
      const globalDir = this.getGlobalIconDir();
      let deleted = false;

      // Try both extensions
      for (const ext of [".svg", ".png"]) {
        const filePath = path.join(globalDir, `${iconName}${ext}`);
        if (await this.pathExists(filePath)) {
          await fs.promises.unlink(filePath);
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        return { success: false, error: `Icon "${iconName}" not found in global icons` };
      }

      log.info(`Deleted global icon: ${iconName}`);
      void vscode.window.showInformationMessage(`Deleted custom icon "${iconName}"`);

      return { success: true };
    } catch (err) {
      const error = `Failed to delete icon: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      return { success: false, error };
    }
  }

  /**
   * Copy an icon from global to workspace .clab-icons/ folder
   */
  async copyToWorkspace(iconName: string, yamlFilePath: string): Promise<boolean> {
    try {
      const globalDir = this.getGlobalIconDir();
      const workspaceDir = this.getWorkspaceIconDir(yamlFilePath);

      // Find the icon in global directory
      let sourceFile: string | null = null;
      let ext = "";

      for (const testExt of [".svg", ".png"]) {
        const testPath = path.join(globalDir, `${iconName}${testExt}`);
        if (await this.pathExists(testPath)) {
          sourceFile = testPath;
          ext = testExt;
          break;
        }
      }

      if (sourceFile === null || sourceFile.length === 0) {
        log.warn(`Cannot copy icon "${iconName}": not found in global icons`);
        return false;
      }

      // Ensure workspace icons directory exists
      await this.ensureDir(workspaceDir);

      // Copy to workspace
      const destPath = path.join(workspaceDir, `${iconName}${ext}`);
      await fs.promises.copyFile(sourceFile, destPath);

      log.info(`Copied icon "${iconName}" to workspace`);
      return true;
    } catch (err) {
      log.error(`Failed to copy icon to workspace: ${err}`);
      return false;
    }
  }

  /**
   * Delete an icon from workspace .clab-icons/ folder
   */
  async deleteFromWorkspace(iconName: string, yamlFilePath: string): Promise<boolean> {
    try {
      const workspaceDir = this.getWorkspaceIconDir(yamlFilePath);

      // Try both extensions
      for (const ext of [".svg", ".png"]) {
        const filePath = path.join(workspaceDir, `${iconName}${ext}`);
        if (await this.pathExists(filePath)) {
          await fs.promises.unlink(filePath);
          log.info(`Deleted workspace icon: ${iconName}`);

          // If workspace icons folder is now empty, remove it
          await this.removeEmptyDir(workspaceDir);
          return true;
        }
      }

      return false;
    } catch (err) {
      log.error(`Failed to delete workspace icon: ${err}`);
      return false;
    }
  }

  /**
   * Check if an icon exists in a directory (any supported extension)
   */
  private async iconExistsInDir(dir: string, iconName: string): Promise<boolean> {
    for (const ext of [".svg", ".png"]) {
      if (await this.pathExists(path.join(dir, `${iconName}${ext}`))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Copy icon from global to workspace directory
   */
  private async copyIconToWorkspace(
    iconName: string,
    workspaceDir: string,
    globalDir: string
  ): Promise<void> {
    for (const ext of [".svg", ".png"]) {
      const globalPath = path.join(globalDir, `${iconName}${ext}`);
      if (await this.pathExists(globalPath)) {
        await this.ensureDir(workspaceDir);
        await fs.promises.copyFile(globalPath, path.join(workspaceDir, `${iconName}${ext}`));
        log.info(`Auto-copied icon "${iconName}" to workspace`);
        return;
      }
    }
  }

  /**
   * Reconcile workspace icons with actual usage.
   * - Copies missing icons from global to workspace
   * - Removes unused icons from workspace
   */
  async reconcileWorkspaceIcons(yamlFilePath: string, usedIconNames: string[]): Promise<void> {
    try {
      // Filter to only custom icons (not built-in)
      const usedCustomIcons = usedIconNames.filter((name) => !isBuiltInIcon(name));

      if (usedCustomIcons.length === 0) {
        await this.cleanWorkspaceIconsFolder(yamlFilePath);
        return;
      }

      const workspaceDir = this.getWorkspaceIconDir(yamlFilePath);
      const globalDir = this.getGlobalIconDir();

      // 1. Copy missing icons from global to workspace
      for (const iconName of usedCustomIcons) {
        const inWorkspace = await this.iconExistsInDir(workspaceDir, iconName);
        if (!inWorkspace) {
          await this.copyIconToWorkspace(iconName, workspaceDir, globalDir);
        }
      }

      // 2. Remove unused icons from workspace
      const workspaceIcons = await this.listIconsFromDir(workspaceDir, "workspace");
      for (const icon of workspaceIcons) {
        if (!usedCustomIcons.includes(icon.name)) {
          await this.deleteFromWorkspace(icon.name, yamlFilePath);
          log.info(`Auto-removed unused icon "${icon.name}" from workspace`);
        }
      }
    } catch (err) {
      log.error(`Failed to reconcile workspace icons: ${err}`);
    }
  }

  /**
   * Clean up the workspace icons folder (remove all icons and folder if empty)
   */
  private async cleanWorkspaceIconsFolder(yamlFilePath: string): Promise<void> {
    const workspaceDir = this.getWorkspaceIconDir(yamlFilePath);

    try {
      if (!(await this.pathExists(workspaceDir))) {
        return;
      }

      const entries = await fs.promises.readdir(workspaceDir);

      // Remove all icon files
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (isSupportedIconExtension(ext)) {
          await fs.promises.unlink(path.join(workspaceDir, entry));
        }
      }

      // Remove folder if empty
      await this.removeEmptyDir(workspaceDir);
    } catch (err) {
      log.warn(`Failed to clean workspace icons folder: ${err}`);
    }
  }

  /**
   * Remove a directory if it's empty
   */
  private async removeEmptyDir(dirPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath);
      if (entries.length === 0) {
        await fs.promises.rmdir(dirPath);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Generate a unique filename for an icon
   */
  private async generateUniqueFileName(
    dir: string,
    baseName: string,
    ext: string
  ): Promise<string> {
    let name = `${baseName}${ext}`;
    let counter = 1;

    while (await this.pathExists(path.join(dir, name))) {
      name = `${baseName}-${counter}${ext}`;
      counter++;
    }

    return name;
  }

  /**
   * Check if a path exists
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

// Export singleton instance
export const iconService = new IconService();
