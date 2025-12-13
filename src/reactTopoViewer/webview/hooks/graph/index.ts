/**
 * Graph manipulation hooks
 *
 * [MIGRATION] Migrate to @xyflow/react - deleted Cytoscape-specific hooks:
 * - useEdgeCreation (replaced by ReactFlow's built-in edge creation)
 * - useNodeCreation
 * - useNodeDragging (ReactFlow handles this natively)
 * - useCopyPaste
 */

// Graph change types for undo/redo
export interface GraphChangeEntry {
  entityType: 'node' | 'edge';
  operation: 'add' | 'delete' | 'update';
  before?: unknown;
  after?: unknown;
}
