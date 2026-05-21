/**
 * VS Code-specific configuration helpers for clab-ui bootstrap data.
 */

import * as vscode from "vscode";

import type { CustomNodeTemplate } from "@srl-labs/clab-ui/session";
import { normalizeCustomNodeTemplates } from "./customNodeTypes";

const CONFIG_SECTION = "containerlab.editor";

/**
 * Get custom nodes from VS Code configuration.
 */
export function getCustomNodesFromConfig(): CustomNodeTemplate[] {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return normalizeCustomNodeTemplates(config.get<CustomNodeTemplate[]>("customNodes", []));
}
