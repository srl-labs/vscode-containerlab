import * as YAML from 'yaml';

/**
 * Interface for lab settings that can be updated
 */
export interface LabSettings {
  name?: string;
  prefix?: string | null;
  mgmt?: Record<string, any> | null;
}

/**
 * Result of applying settings to a YAML document
 */
export interface ApplySettingsResult {
  hadPrefix: boolean;
  hadMgmt: boolean;
}

/**
 * Manages YAML settings operations for containerlab topology files.
 * Provides utilities for updating lab settings like name, prefix, and mgmt.
 */
export class YamlSettingsManager {
  /**
   * Applies existing settings to a YAML document.
   * Updates name, prefix, and mgmt fields if they exist in both the document and settings.
   */
  applyExistingSettings(doc: YAML.Document, settings: LabSettings): ApplySettingsResult {
    if (settings.name !== undefined && settings.name !== '') {
      doc.set('name', settings.name);
    }
    const hadPrefix = doc.has('prefix');
    const hadMgmt = doc.has('mgmt');
    if (settings.prefix !== undefined && hadPrefix) {
      if (settings.prefix === null) {
        doc.delete('prefix');
      } else {
        doc.set('prefix', settings.prefix);
      }
    }
    if (settings.mgmt !== undefined && hadMgmt) {
      if (settings.mgmt === null || (typeof settings.mgmt === 'object' && Object.keys(settings.mgmt).length === 0)) {
        doc.delete('mgmt');
      } else {
        doc.set('mgmt', settings.mgmt);
      }
    }
    return { hadPrefix, hadMgmt };
  }

  /**
   * Inserts missing settings into the YAML content.
   * Called after applyExistingSettings to add new prefix/mgmt fields.
   */
  insertMissingSettings(
    updatedYaml: string,
    settings: LabSettings,
    hadPrefix: boolean,
    hadMgmt: boolean
  ): string {
    updatedYaml = this.maybeInsertPrefix(updatedYaml, settings, hadPrefix);
    updatedYaml = this.maybeInsertMgmt(updatedYaml, settings, hadMgmt);
    return updatedYaml;
  }

  /**
   * Inserts prefix field after the name field if it doesn't exist.
   */
  private maybeInsertPrefix(updatedYaml: string, settings: LabSettings, hadPrefix: boolean): string {
    if (settings.prefix === undefined || settings.prefix === null || hadPrefix) {
      return updatedYaml;
    }
    const lines = updatedYaml.split('\n');
    const nameIndex = lines.findIndex(line => line.trim().startsWith('name:'));
    if (nameIndex === -1) {
      return updatedYaml;
    }
    const prefixValue = settings.prefix === '' ? '""' : settings.prefix;
    lines.splice(nameIndex + 1, 0, `prefix: ${prefixValue}`);
    return lines.join('\n');
  }

  /**
   * Inserts mgmt section after prefix (or name) if it doesn't exist.
   */
  private maybeInsertMgmt(updatedYaml: string, settings: LabSettings, hadMgmt: boolean): string {
    if (settings.mgmt === undefined || hadMgmt || !settings.mgmt || Object.keys(settings.mgmt).length === 0) {
      return updatedYaml;
    }
    const lines = updatedYaml.split('\n');
    let insertIndex = lines.findIndex(line => line.trim().startsWith('prefix:'));
    if (insertIndex === -1) {
      insertIndex = lines.findIndex(line => line.trim().startsWith('name:'));
    }
    if (insertIndex === -1) {
      return updatedYaml;
    }
    const mgmtYaml = YAML.stringify({ mgmt: settings.mgmt });
    const mgmtLines = mgmtYaml.split('\n').filter(line => line.trim());
    const nextLine = lines[insertIndex + 1];
    if (nextLine && nextLine.trim() !== '') {
      lines.splice(insertIndex + 1, 0, '', ...mgmtLines);
    } else {
      lines.splice(insertIndex + 1, 0, ...mgmtLines);
    }
    return lines.join('\n');
  }
}

// Export a singleton instance
export const yamlSettingsManager = new YamlSettingsManager();
