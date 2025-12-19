/**
 * CommandRegistry - Shared command constants for message routing
 *
 * This module defines all commands used by both the extension's MessageRouter
 * and the dev mock's MessageHandler. Having a single source of truth prevents
 * drift between production and development environments.
 */

// ============================================================================
// Command Arrays (for type inference and iteration)
// ============================================================================

export const NODE_COMMANDS = [
  'clab-node-connect-ssh',
  'clab-node-attach-shell',
  'clab-node-view-logs',
] as const;

export const INTERFACE_COMMANDS = [
  'clab-interface-capture',
] as const;

export const LIFECYCLE_COMMANDS = [
  'deployLab',
  'destroyLab',
  'deployLabCleanup',
  'destroyLabCleanup',
  'redeployLab',
  'redeployLabCleanup',
] as const;

export const EDITOR_COMMANDS = [
  'create-node',
  'save-node-editor',
  'apply-node-editor',
  'undo-rename-node',
  'create-link',
  'save-link-editor',
  'apply-link-editor',
  'save-lab-settings',
] as const;

export const PANEL_COMMANDS = [
  'panel-node-info',
  'panel-edit-node',
  'panel-delete-node',
  'panel-start-link',
  'panel-link-info',
  'panel-edit-link',
  'panel-delete-link',
] as const;

export const ANNOTATION_COMMANDS = [
  'save-node-positions',
  'save-network-position',
  'save-free-text-annotations',
  'save-free-shape-annotations',
  'save-group-style-annotations',
  'save-node-group-membership',
  'panel-add-text',
  'panel-add-shapes',
] as const;

export const CUSTOM_NODE_COMMANDS = [
  'save-custom-node',
  'delete-custom-node',
  'set-default-custom-node',
] as const;

export const CLIPBOARD_COMMANDS = [
  'copyElements',
  'getCopiedElements',
] as const;

export const BATCH_COMMANDS = [
  'begin-graph-batch',
  'end-graph-batch',
] as const;

export const MISC_COMMANDS = [
  'topo-toggle-split-view',
  'toggle-lock-state',
  'nav-geo-controls',
  'nav-layout-toggle',
  'nav-grid-settings',
] as const;

export const LOG_COMMANDS = [
  'reactTopoViewerLog',
  'topoViewerLog',
] as const;

// ============================================================================
// Command Sets (for efficient O(1) lookup)
// ============================================================================

export const NODE_COMMAND_SET = new Set<string>(NODE_COMMANDS);
export const INTERFACE_COMMAND_SET = new Set<string>(INTERFACE_COMMANDS);
export const LIFECYCLE_COMMAND_SET = new Set<string>(LIFECYCLE_COMMANDS);
export const EDITOR_COMMAND_SET = new Set<string>(EDITOR_COMMANDS);
export const PANEL_COMMAND_SET = new Set<string>(PANEL_COMMANDS);
export const ANNOTATION_COMMAND_SET = new Set<string>(ANNOTATION_COMMANDS);
export const CUSTOM_NODE_COMMAND_SET = new Set<string>(CUSTOM_NODE_COMMANDS);
export const CLIPBOARD_COMMAND_SET = new Set<string>(CLIPBOARD_COMMANDS);
export const BATCH_COMMAND_SET = new Set<string>(BATCH_COMMANDS);
export const MISC_COMMAND_SET = new Set<string>(MISC_COMMANDS);
export const LOG_COMMAND_SET = new Set<string>(LOG_COMMANDS);

// ============================================================================
// Command Types (for type-safe command handling)
// ============================================================================

export type NodeCommand = typeof NODE_COMMANDS[number];
export type InterfaceCommand = typeof INTERFACE_COMMANDS[number];
export type LifecycleCommand = typeof LIFECYCLE_COMMANDS[number];
export type EditorCommand = typeof EDITOR_COMMANDS[number];
export type PanelCommand = typeof PANEL_COMMANDS[number];
export type AnnotationCommand = typeof ANNOTATION_COMMANDS[number];
export type CustomNodeCommand = typeof CUSTOM_NODE_COMMANDS[number];
export type ClipboardCommand = typeof CLIPBOARD_COMMANDS[number];
export type BatchCommand = typeof BATCH_COMMANDS[number];
export type MiscCommand = typeof MISC_COMMANDS[number];
export type LogCommand = typeof LOG_COMMANDS[number];

export type CommandType =
  | NodeCommand
  | InterfaceCommand
  | LifecycleCommand
  | EditorCommand
  | PanelCommand
  | AnnotationCommand
  | CustomNodeCommand
  | ClipboardCommand
  | BatchCommand
  | MiscCommand
  | LogCommand;

// ============================================================================
// Command Category Enum
// ============================================================================

export type CommandCategory =
  | 'node'
  | 'interface'
  | 'lifecycle'
  | 'editor'
  | 'panel'
  | 'annotation'
  | 'customNode'
  | 'clipboard'
  | 'batch'
  | 'misc'
  | 'log';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the category of a command string
 * @returns The command category, or null if unknown
 */
export function getCommandCategory(command: string): CommandCategory | null {
  if (NODE_COMMAND_SET.has(command)) return 'node';
  if (INTERFACE_COMMAND_SET.has(command)) return 'interface';
  if (LIFECYCLE_COMMAND_SET.has(command)) return 'lifecycle';
  if (EDITOR_COMMAND_SET.has(command)) return 'editor';
  if (PANEL_COMMAND_SET.has(command)) return 'panel';
  if (ANNOTATION_COMMAND_SET.has(command)) return 'annotation';
  if (CUSTOM_NODE_COMMAND_SET.has(command)) return 'customNode';
  if (CLIPBOARD_COMMAND_SET.has(command)) return 'clipboard';
  if (BATCH_COMMAND_SET.has(command)) return 'batch';
  if (MISC_COMMAND_SET.has(command)) return 'misc';
  if (LOG_COMMAND_SET.has(command)) return 'log';
  return null;
}

/**
 * Check if a command is a log command
 */
export function isLogCommand(command: string): boolean {
  return LOG_COMMAND_SET.has(command);
}

/**
 * Check if a command requires edit mode (not available in view mode)
 */
export function requiresEditMode(command: string): boolean {
  return EDITOR_COMMAND_SET.has(command) ||
    ANNOTATION_COMMAND_SET.has(command) ||
    CUSTOM_NODE_COMMAND_SET.has(command) ||
    command === 'panel-delete-node' ||
    command === 'panel-delete-link' ||
    command === 'panel-start-link';
}
