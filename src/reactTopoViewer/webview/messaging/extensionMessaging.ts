/**
 * VS Code extension messaging helpers.
 * Use for VS Code/CLI operations and settings updates. Topology persistence goes
 * through the host command pipeline, not these messages.
 */
import type { ExtensionCommandType } from "../../shared/messages/extension";
import type { SaveCustomNodeData } from "../../shared/utilities/customNodeConversions";
import { log } from "../utils/logger";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
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

// ============================================================================
// ICON RECONCILIATION
// ============================================================================

/**
 * Trigger icon reconciliation on the extension side.
 * This copies used custom icons from global to workspace, and removes unused ones.
 *
 * @param usedIcons - Array of custom icon names currently used by nodes
 */
export function sendIconReconcile(usedIcons: string[]): void {
  sendCommandToExtension("icon-reconcile", { usedIcons });
}
