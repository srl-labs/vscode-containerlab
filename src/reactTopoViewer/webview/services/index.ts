/**
 * Webview Services
 *
 * This module provides I/O services for the webview:
 * - Service initialization and getters
 * - Annotation save helpers
 * - Topology CRUD operations
 */

// Re-export service initialization
export {
  initializeServices,
  resetServices,
  isServicesInitialized,
  getFsAdapter,
  getTopologyIO,
  getAnnotationsIO,
} from './serviceInitialization';

// Re-export annotation save helpers
export {
  saveFreeTextAnnotations,
  saveFreeShapeAnnotations,
  saveGroupStyleAnnotations,
  saveViewerSettings,
} from './annotationSaveHelpers';

// Re-export topology CRUD helpers
export {
  createNode,
  editNode,
  deleteNode,
  createLink,
  editLink,
  deleteLink,
  createNetworkNode,
  saveNodePositions,
  beginBatch,
  endBatch,
} from './topologyCrud';

// Re-export types
export type { NodeSaveData, LinkSaveData, NetworkNodeData } from './topologyCrud';
