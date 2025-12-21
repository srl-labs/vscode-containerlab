/**
 * Production Service Adapters
 *
 * These adapters wrap the VS Code extension services to implement
 * the shared service interfaces from MessageServiceInterfaces.
 */

// Re-export schema adapter functions
export { getCustomNodesFromConfig, loadSchemaData } from './schemaAdapter';

// Re-export all adapter classes
export { MessagingServiceAdapter } from './MessagingServiceAdapter';
export { PersistenceServiceAdapter } from './PersistenceServiceAdapter';
export { AnnotationsServiceAdapter, annotationsIO } from './AnnotationsServiceAdapter';
export { NodeCommandServiceAdapter } from './NodeCommandServiceAdapter';
export { LifecycleServiceAdapter } from './LifecycleServiceAdapter';
export { CustomNodeServiceAdapter } from './CustomNodeServiceAdapter';
export { SplitViewServiceAdapter } from './SplitViewServiceAdapter';
export { LabSettingsServiceAdapter } from './LabSettingsServiceAdapter';
export { MessageRouterContextAdapter } from './MessageRouterContextAdapter';

// Re-export logger adapter
export { extensionLogger } from './loggerAdapter';

// Re-export factory function
export { createProductionServices } from './createProductionServices';
