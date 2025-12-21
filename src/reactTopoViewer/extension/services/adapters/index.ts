/**
 * Production Service Adapters
 *
 * These adapters wrap the VS Code extension services to implement
 * the shared service interfaces from MessageServiceInterfaces.
 *
 * Most simple adapters are now inlined in createProductionServices.ts.
 * Only adapters with state or complex logic remain as separate classes.
 */

// Re-export schema adapter functions
export { getCustomNodesFromConfig, loadSchemaData } from './schemaAdapter';

// Re-export class-based adapters (have state or complex logic)
export { AnnotationsServiceAdapter, annotationsIO } from './AnnotationsServiceAdapter';
export { NodeCommandServiceAdapter } from './NodeCommandServiceAdapter';
export { LabSettingsServiceAdapter } from './LabSettingsServiceAdapter';
export { MessageRouterContextAdapter } from './MessageRouterContextAdapter';

// Re-export logger adapter
export { extensionLogger } from './loggerAdapter';

// Re-export factory function
export { createProductionServices } from './createProductionServices';
