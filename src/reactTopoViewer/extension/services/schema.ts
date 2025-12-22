/**
 * Schema utilities (VS Code extension host)
 *
 * VS Code-specific schema loading and configuration helpers.
 * Pure schema parsing is implemented in `src/reactTopoViewer/shared/schema`.
 */

import * as vscode from 'vscode';

import { nodeFsAdapter } from '../../shared/io';
import type { CustomNodeTemplate, SchemaData } from '../../shared/schema';
import { parseSchemaData } from '../../shared/schema';

import { log } from './logger';

const CONFIG_SECTION = 'containerlab.editor';

/**
 * Get custom nodes from VS Code configuration.
 */
export function getCustomNodesFromConfig(): CustomNodeTemplate[] {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<CustomNodeTemplate[]>('customNodes', []);
}

/**
 * Load schema data from the extension's schema file.
 */
export async function loadSchemaData(extensionUri: vscode.Uri): Promise<SchemaData> {
  try {
    const schemaUri = vscode.Uri.joinPath(extensionUri, 'schema', 'clab.schema.json');
    const schemaContent = await nodeFsAdapter.readFile(schemaUri.fsPath);
    const schema = JSON.parse(schemaContent) as Record<string, unknown>;
    return parseSchemaData(schema);
  } catch (err) {
    log.error(`Error loading schema data: ${err}`);
    return {
      kinds: [],
      typesByKind: {},
      srosComponentTypes: { sfm: [], cpm: [], card: [], mda: [], xiom: [], xiomMda: [] }
    };
  }
}

