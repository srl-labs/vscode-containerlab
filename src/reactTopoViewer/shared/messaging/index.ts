/**
 * Shared messaging module
 *
 * Provides command registry, service interfaces, and message handling base class
 * for both VS Code extension and dev mock environments.
 *
 * For full command registry (arrays, sets), import from './CommandRegistry'.
 */

// Command registry - commonly used types and utilities
export {
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
  type ISplitViewService,
  type ILabSettingsService,
  type IMessageRouterContext,
  type MessageHandlerServices,
} from './MessageServiceInterfaces';

// Message handler base class
export { MessageHandlerBase } from './MessageHandlerBase';
