/**
 * React TopoViewer hooks
 *
 * [MIGRATION] Migrating from Cytoscape to @xyflow/react
 */

// Graph manipulation
export * from './graph';

// State management
export * from './state';

// UI interactions
export * from './ui';

// Data fetching
export * from './data';

// Annotations
export * from './annotations';

// Groups
export * from './groups';

// React Flow hooks
export {
  useReactFlowInstance,
  useRFSelectionData,
  useRFNavbarActions,
  useRFLayoutControls,
  useRFContextMenuHandlers
} from './useReactFlowState';

export * from './react-flow';

// ============================================================================
// Compatibility exports - [MIGRATION] Remove after full ReactFlow migration
// ============================================================================

export type LayoutOption = 'preset' | 'cola' | 'radial' | 'hierarchical' | 'cose' | 'geo';
export const DEFAULT_GRID_LINE_WIDTH = 0.5;

export interface NodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  state?: string;
  image?: string;
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  fqdn?: string;
  [key: string]: unknown;
}

export interface LinkData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Stub hook for graph undo/redo handlers
 * [MIGRATION] Implement for ReactFlow
 */
export function useGraphUndoRedoHandlers(_options?: unknown) {
  // Stub undo/redo object with all expected properties
  const undoRedo = {
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    pushAction: (_action: unknown) => {},
    recordMove: (_nodeIds: string[], _beforePositions: unknown[]) => {},
    clearHistory: () => {},
    capturePositions: (_nodeIds: string[]) => [] as unknown[],
    undoCount: 0,
    redoCount: 0
  };

  return {
    undoRedo,
    handleDeleteNodeWithUndo: (_nodeId: string) => {},
    handleDeleteLinkWithUndo: (_edgeId: string) => {},
    recordPropertyEdit: (_entityType: string, _entityId: string, _before: unknown, _after: unknown) => {},
    applyGraphChanges: (_changes: unknown[]) => {},
    applyPropertyEdit: (_action: unknown, _isUndo: boolean) => {}
  };
}
