/**
 * Helper utilities for sending messages from the React webview to the VS Code extension.
 *
 * ARCHITECTURE NOTE: This module is for VS Code extension integration commands only.
 * Topology persistence is owned by the webview (via hooks + shared `TopologyIO`/`AnnotationsIO`).
 * Those services perform file I/O through `PostMessageFsAdapter` (fs:* bridge), not via command messages.
 *
 * SERVICE-BASED OPERATIONS (DO NOT use sendCommandToExtension):
 * ================================================================
 * - Node/link CRUD + lab settings edits
 * - Annotation saves (positions, free-text, free-shapes, groups)
 * - Batch operations
 * → Use hooks/services (e.g. `useLabSettings`, `createNode`, `editLink`) which call `TopologyIO` directly.
 *
 * MESSAGING-BASED OPERATIONS (OK to use sendCommandToExtension):
 * ================================================================
 * 1. CONTAINERLAB COMMANDS (require VS Code terminal/CLI access):
 *    - clab-node-connect-ssh, clab-node-attach-shell, clab-node-view-logs
 *    - clab-interface-capture
 *    - deployLab, destroyLab, redeployLab, *Cleanup commands
 *
 * 2. VS CODE UI INTEGRATION (require VS Code API):
 *    - topo-toggle-split-view (VS Code split editor)
 *    - Custom node templates: save-custom-node, delete-custom-node, set-default-custom-node
 *      (stored in VS Code settings, not annotations)
 */
import type { ExtensionCommandType } from "../../shared/messages/extension";
import type { SaveCustomNodeData } from "../../shared/utilities/customNodeConversions";

import { log } from "./logger";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}

/**
 * Get VS Code API instance exposed by the extension host.
 */
function getVscodeApi(): { postMessage(data: unknown): void } | undefined {
  return typeof window !== "undefined" ? window.vscode : undefined;
}

/**
 * Send a fire-and-forget command message to the extension.
 *
 * IMPORTANT: Only use this for:
 * 1. Containerlab CLI operations (SSH, logs, capture, deploy/destroy)
 * 2. VS Code-specific operations (split view, custom node templates in settings)
 * 3. UI state coordination between webview and extension
 *
 * DO NOT use this for topology data operations - use service hooks instead.
 */
export function sendCommandToExtension(
  command: ExtensionCommandType,
  payload?: Record<string, unknown>
): void {
  const vscodeApi = getVscodeApi();
  if (!vscodeApi) {
    log.warn(`[ExtensionMessaging] VS Code API unavailable, command skipped: ${command}`);
    return;
  }

  const message = payload ? { command, ...payload } : { command };
  vscodeApi.postMessage(message);
  log.debug(`[ExtensionMessaging] Sent command: ${command}`);
}

// ============================================================================
// CUSTOM NODE TEMPLATE COMMANDS
// ============================================================================
// These commands manage custom node templates stored in VS Code workspace settings.
// They use messaging because they interact with VS Code's configuration API.
// DO NOT confuse with node CRUD operations (create-node, save-node-editor, etc.)
// which use services for YAML/annotation persistence.

/**
 * Delete a custom node template from VS Code settings.
 *
 * This removes a user-defined node template stored in workspace configuration.
 * Handled by: extension `MessageRouter`
 */
export function sendDeleteCustomNode(nodeName: string): void {
  sendCommandToExtension("delete-custom-node", { name: nodeName });
}

/**
 * Set a custom node template as the default for new nodes.
 *
 * This updates VS Code settings to mark a template as the default.
 * Handled by: extension `MessageRouter`
 */
export function sendSetDefaultCustomNode(nodeName: string): void {
  sendCommandToExtension("set-default-custom-node", { name: nodeName });
}

/**
 * Save a custom node template to VS Code settings.
 *
 * This creates or updates a user-defined node template in workspace configuration.
 * Templates define reusable node configurations (kind, image, icon, etc.)
 * and are stored in VS Code workspace settings, NOT in topology files.
 *
 * Handled by: extension `MessageRouter`
 */
export function sendSaveCustomNode(data: SaveCustomNodeData): void {
  sendCommandToExtension("save-custom-node", data);
}

/**
 * Alias for sendCommandToExtension - simpler name for common use cases.
 */
export const postCommand = sendCommandToExtension;
