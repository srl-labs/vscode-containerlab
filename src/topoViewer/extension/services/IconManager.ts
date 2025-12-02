import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { log } from '../../webview/platform/logging/logger';

const SUPPORTED_ICON_EXTENSIONS = new Set(['.svg', '.png']);

/**
 * Manages custom icons for containerlab nodes.
 * Handles importing, deleting, and loading custom icons from the user's .clab/icons directory.
 */
export class IconManager {
  /**
   * Gets the directory where custom icons are stored.
   */
  getCustomIconDirectory(): string {
    return path.join(os.homedir(), '.clab', 'icons');
  }

  /**
   * Sanitizes a filename to be safe for use as an icon base name.
   */
  sanitizeIconBaseName(name: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    let start = 0;
    while (start < normalized.length && normalized[start] === '-') {
      start += 1;
    }
    let end = normalized.length;
    while (end > start && normalized[end - 1] === '-') {
      end -= 1;
    }
    const trimmed = normalized.slice(start, end);
    return trimmed || 'custom-icon';
  }

  /**
   * Ensures the custom icon directory exists, creating it if necessary.
   */
  async ensureCustomIconDirectory(): Promise<string> {
    const dir = this.getCustomIconDirectory();
    await fsPromises.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Checks if a path exists.
   */
  async pathExists(target: string): Promise<boolean> {
    try {
      await fsPromises.access(target);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates a unique filename for an icon, appending a counter if necessary.
   */
  async generateUniqueIconFileName(dir: string, base: string, ext: string): Promise<string> {
    let candidate = `${base}${ext}`;
    let counter = 1;
    while (await this.pathExists(path.join(dir, candidate))) {
      candidate = `${base}-${counter}${ext}`;
      counter += 1;
    }
    return candidate;
  }

  /**
   * Imports a custom icon from a URI.
   * @returns The name and file path of the imported icon.
   */
  async importCustomIcon(uri: vscode.Uri): Promise<{ name: string; filePath: string }> {
    const ext = path.extname(uri.path).toLowerCase();
    if (!SUPPORTED_ICON_EXTENSIONS.has(ext)) {
      throw new Error('Only .svg and .png icons are supported.');
    }
    const dir = await this.ensureCustomIconDirectory();
    const baseName = this.sanitizeIconBaseName(path.basename(uri.path, ext));
    const fileName = await this.generateUniqueIconFileName(dir, baseName, ext);
    const destination = path.join(dir, fileName);
    const content = await vscode.workspace.fs.readFile(uri);
    await fsPromises.writeFile(destination, Buffer.from(content));
    return { name: path.basename(fileName, ext), filePath: destination };
  }

  /**
   * Deletes a custom icon by name.
   * @returns true if the icon was deleted, false if not found.
   */
  async deleteCustomIcon(iconName: string): Promise<boolean> {
    const dir = this.getCustomIconDirectory();
    if (!(await this.pathExists(dir))) {
      return false;
    }
    let deleted = false;
    for (const ext of SUPPORTED_ICON_EXTENSIONS) {
      const candidate = path.join(dir, `${iconName}${ext}`);
      if (await this.pathExists(candidate)) {
        await fsPromises.unlink(candidate);
        deleted = true;
      }
    }
    return deleted;
  }

  /**
   * Loads all custom icons from the icon directory.
   * @returns A record mapping icon names to their data URIs.
   */
  async loadCustomIcons(): Promise<Record<string, string>> {
    const dir = this.getCustomIconDirectory();
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      const result: Record<string, string> = {};
      for (const entry of entries) {
        const iconRecord = await this.readCustomIconEntry(dir, entry);
        if (iconRecord) {
          result[iconRecord.name] = iconRecord.data;
        }
      }
      return result;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return {};
      }
      log.error(`Failed to read custom icon directory: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  /**
   * Reads a single icon entry from the directory.
   */
  private async readCustomIconEntry(
    dir: string,
    entry: fs.Dirent
  ): Promise<{ name: string; data: string } | null> {
    if (!entry.isFile()) {
      return null;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_ICON_EXTENSIONS.has(ext)) {
      return null;
    }
    try {
      const buffer = await fsPromises.readFile(path.join(dir, entry.name));
      const mime = ext === '.svg' ? 'image/svg+xml' : 'image/png';
      const base64 = buffer.toString('base64');
      return { name: path.basename(entry.name, ext), data: `data:${mime};base64,${base64}` };
    } catch (error) {
      log.warn(
        `Failed to load custom icon ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Prompts the user to select an icon upload source (remote or local).
   * Only shows the picker when running in a remote environment.
   */
  async promptIconUploadSource(): Promise<'remote' | 'local' | null> {
    if (!vscode.env.remoteName) {
      return 'remote';
    }

    const pick = await vscode.window.showQuickPick<{
      label: string;
      description: string;
      value: 'remote' | 'local';
    }>(
      [
        {
          label: 'Upload from remote environment',
          description: 'Use a file accessible from the current VS Code session',
          value: 'remote'
        },
        {
          label: 'Upload from local machine',
          description: 'Choose a file on your local computer (SSH/WSL)',
          value: 'local'
        }
      ],
      {
        title: 'Select icon source',
        placeHolder: 'Where should the custom icon be uploaded from?'
      }
    );

    return pick?.value ?? null;
  }

  /**
   * Gets the options for the icon file picker dialog.
   */
  getIconPickerOptions(source: 'remote' | 'local'): vscode.OpenDialogOptions {
    const baseOptions: vscode.OpenDialogOptions = {
      canSelectMany: false,
      title: 'Select a Containerlab icon',
      openLabel: 'Import Icon',
      filters: { Images: ['svg', 'png'], SVG: ['svg'] }
    };

    if (source === 'local') {
      const defaultUri = this.getLocalFilePickerBaseUri();
      if (defaultUri) {
        baseOptions.defaultUri = defaultUri;
      }
    }

    return baseOptions;
  }

  /**
   * Gets the base URI for the local file picker.
   */
  private getLocalFilePickerBaseUri(): vscode.Uri | undefined {
    try {
      return vscode.Uri.parse('vscode-userdata:/');
    } catch (err) {
      log.warn(
        `Failed to build local file picker URI: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  }
}

// Export a singleton instance for convenience
export const iconManager = new IconManager();
