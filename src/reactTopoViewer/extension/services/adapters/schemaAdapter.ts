/**
 * Schema Adapter - VS Code-specific schema loading functions
 *
 * Contains only the VS Code-specific functions that require vscode APIs.
 * Pure parsing functions are in shared/schema/SchemaParser.ts.
 */

import * as vscode from 'vscode';
import { nodeFsAdapter } from '../../../shared/io';
import type { CustomNodeTemplate, SchemaData } from '../../../shared/schema';
import { parseSchemaData } from '../../../shared/schema';
import { log } from '../logger';

/**
 * Get custom nodes from VS Code configuration
 */
export function getCustomNodesFromConfig(): CustomNodeTemplate[] {
  const config = vscode.workspace.getConfiguration('containerlab.editor');
  return config.get<CustomNodeTemplate[]>('customNodes', []);
}

/**
 * Load schema data from the extension's schema file
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
