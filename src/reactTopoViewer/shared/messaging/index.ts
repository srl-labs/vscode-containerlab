/**
 * Shared messaging module
 *
 * Provides command registry, service interfaces, and message handling base class
 * for both VS Code extension and dev mock environments.
 */

// Command registry - all command constants and utilities
export {
  // Command arrays
  NODE_COMMANDS,
  INTERFACE_COMMANDS,
  LIFECYCLE_COMMANDS,
  EDITOR_COMMANDS,
  PANEL_COMMANDS,
  ANNOTATION_COMMANDS,
  CUSTOM_NODE_COMMANDS,
  CLIPBOARD_COMMANDS,
  BATCH_COMMANDS,
  MISC_COMMANDS,
  LOG_COMMANDS,
  // Command sets
  NODE_COMMAND_SET,
  INTERFACE_COMMAND_SET,
  LIFECYCLE_COMMAND_SET,
  EDITOR_COMMAND_SET,
  PANEL_COMMAND_SET,
  ANNOTATION_COMMAND_SET,
  CUSTOM_NODE_COMMAND_SET,
  CLIPBOARD_COMMAND_SET,
  BATCH_COMMAND_SET,
  MISC_COMMAND_SET,
  LOG_COMMAND_SET,
  // Command types
  type NodeCommand,
  type InterfaceCommand,
  type LifecycleCommand,
  type EditorCommand,
  type PanelCommand,
  type AnnotationCommand,
  type CustomNodeCommand,
  type ClipboardCommand,
  type BatchCommand,
  type MiscCommand,
  type LogCommand,
  type CommandType,
  type CommandCategory,
  // Utility functions
  getCommandCategory,
  isLogCommand,
  requiresEditMode,
} from './CommandRegistry';

// Service interfaces
export {
  // Types
  type NodePositionData,
  type WebviewMessage,
  type SaveResult,
  type NodeSaveData,
  type LinkSaveData,
  type IOLogger,
  // Service interfaces
  type IMessagingService,
  type IPersistenceService,
  type IAnnotationsService,
  type INodeCommandService,
  type ILifecycleService,
  type ICustomNodeService,
  type IClipboardService,
  type ISplitViewService,
  type ILabSettingsService,
  type IMessageRouterContext,
  type MessageHandlerServices,
} from './MessageServiceInterfaces';

// Message handler base class
export { MessageHandlerBase } from './MessageHandlerBase';
