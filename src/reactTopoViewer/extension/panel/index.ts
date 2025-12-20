/**
 * Panel module exports
 */

// Panel management
export {
  createPanel,
  generateNonce,
  generateWebviewHtml
} from './PanelManager';
export type { PanelConfig, WebviewPanelOptions, WebviewHtmlData } from './PanelManager';

// Message routing
export { MessageRouter } from './MessageRouter';
export type { MessageRouterContext } from './MessageRouter';

// File watchers
export { WatcherManager } from './Watchers';
export type { TopologyDataLoader, TopologyDataPoster, InternalUpdateController } from './Watchers';

// Bootstrap data
export { buildBootstrapData } from './BootstrapDataBuilder';
export type { BootstrapData, BootstrapDataInput } from './BootstrapDataBuilder';

// Schema types and functions
export type { CustomNodeTemplate, SchemaData } from '../../shared/schema';
export {
  extractKindsFromSchema,
  extractTypesByKindFromSchema,
  extractSrosComponentTypes,
  parseSchemaData
} from '../../shared/schema';

// Service adapters
export { getCustomNodesFromConfig, loadSchemaData } from '../services/adapters';
