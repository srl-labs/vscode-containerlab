/**
 * Lab Settings Service Adapter
 *
 * Adapter for saving lab settings to YAML
 */

import * as vscode from 'vscode';
import * as YAML from 'yaml';

import { nodeFsAdapter } from '../../../shared/io';
import type { ILabSettingsService } from '../../../shared/messaging';
import { yamlSettingsManager } from '../YamlSettingsManager';

export class LabSettingsServiceAdapter implements ILabSettingsService {
  async saveLabSettings(
    yamlFilePath: string,
    settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }
  ): Promise<void> {
    const yamlContent = await nodeFsAdapter.readFile(yamlFilePath);
    const doc = YAML.parseDocument(yamlContent);

    const { hadPrefix, hadMgmt } = yamlSettingsManager.applyExistingSettings(doc, settings);
    let updatedYaml = doc.toString();
    updatedYaml = yamlSettingsManager.insertMissingSettings(updatedYaml, settings, hadPrefix, hadMgmt);

    await nodeFsAdapter.writeFile(yamlFilePath, updatedYaml);
    void vscode.window.showInformationMessage('Lab settings saved successfully');
  }
}
