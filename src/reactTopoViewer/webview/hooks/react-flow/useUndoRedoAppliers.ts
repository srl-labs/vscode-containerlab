/**
 * Undo/Redo Action Appliers
 * Functions to apply undo/redo actions to the graph state
 */
import type React from 'react';
import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';

import type { CyElement } from '../../../shared/types/messages';
import type {
  NodePositionEntry,
  GraphChange,
  UndoRedoActionPropertyEdit,
  UndoRedoActionAnnotation,
  UndoRedoAction
} from '../state/useUndoRedo';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';

const TOPOLOGY_NODE_TYPE = 'topology-node';
const TOPOLOGY_EDGE_TYPE = 'topology-edge';

// Action type constants
const ACTION_MOVE = 'move';
const ACTION_GRAPH = 'graph';
const ACTION_PROPERTY_EDIT = 'property-edit';
const ACTION_ANNOTATION = 'annotation';

/** Helper context for graph change handlers */
interface ChangeContext {
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
}

/** Restore a deleted node (undo delete) */
function restoreNode(element: CyElement, ctx: ChangeContext): void {
  const data = element.data as Record<string, unknown>;
  const extraData = data.extraData as Record<string, unknown> || {};
  const position = extraData.position as { x: number; y: number } || { x: 0, y: 0 };
  log.info(`[UndoRedo] Restoring deleted node: ${data.id}`);
  ctx.addNode(element);
  ctx.updateNodes(nds => [...nds, { id: data.id as string, type: TOPOLOGY_NODE_TYPE, position, data }]);
}

/** Re-delete a node (redo delete) */
function reDeleteNode(element: CyElement, ctx: ChangeContext): void {
  const nodeId = (element.data as Record<string, unknown>).id as string;
  log.info(`[UndoRedo] Re-deleting node: ${nodeId}`);
  ctx.removeNodeAndEdges(nodeId);
  ctx.updateNodes(nds => nds.filter(n => n.id !== nodeId));
  ctx.updateEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  sendCommandToExtension('panel-delete-node', { nodeId });
}

/** Restore a deleted edge (undo delete) */
function restoreEdge(element: CyElement, ctx: ChangeContext): void {
  const data = element.data as Record<string, unknown>;
  log.info(`[UndoRedo] Restoring deleted edge: ${data.id}`);
  ctx.addEdge(element);
  ctx.updateEdges(eds => [...eds, {
    id: data.id as string,
    source: data.source as string,
    target: data.target as string,
    type: TOPOLOGY_EDGE_TYPE,
    data
  }]);
}

/** Re-delete an edge (redo delete) */
function reDeleteEdge(element: CyElement, ctx: ChangeContext): void {
  const edgeId = (element.data as Record<string, unknown>).id as string;
  log.info(`[UndoRedo] Re-deleting edge: ${edgeId}`);
  ctx.removeEdge(edgeId);
  ctx.updateEdges(eds => eds.filter(e => e.id !== edgeId));
}

/** Apply a single graph change */
function applySingleChange(change: GraphChange, isUndo: boolean, ctx: ChangeContext): void {
  if (change.kind !== 'delete') return;

  if (change.entity === 'node') {
    if (isUndo && change.before) restoreNode(change.before, ctx);
    else if (!isUndo && change.after) reDeleteNode(change.after, ctx);
  } else if (change.entity === 'edge') {
    if (isUndo && change.before) restoreEdge(change.before, ctx);
    else if (!isUndo && change.after) reDeleteEdge(change.after, ctx);
  }
}

export interface UseUndoRedoAppliersOptions {
  setNodePositions: (positions: NodePositionEntry[]) => void;
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  isApplyingRef: React.RefObject<boolean>;
}

export interface UseUndoRedoAppliersReturn {
  applyAction: (action: UndoRedoAction, isUndo: boolean) => void;
}

/** Apply property edit action */
function applyPropertyEditAction(action: UndoRedoActionPropertyEdit, isUndo: boolean): void {
  const dataToApply = isUndo ? action.before : action.after;
  const cmd = action.entityType === 'node' ? 'apply-node-editor' : 'apply-link-editor';
  const key = action.entityType === 'node' ? 'nodeData' : 'linkData';
  sendCommandToExtension(cmd, { [key]: dataToApply });
  log.info(`[UndoRedo] Applied ${action.entityType} property ${isUndo ? 'undo' : 'redo'} for ${action.entityId}`);
}

/** Create the apply action callback */
function createApplyAction(
  ctx: ChangeContext,
  setNodePositions: (positions: NodePositionEntry[]) => void,
  isApplyingRef: React.RefObject<boolean>,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void
) {
  return (action: UndoRedoAction, isUndo: boolean) => {
    switch (action.type) {
      case ACTION_MOVE:
        setNodePositions(isUndo ? action.before : action.after);
        break;
      case ACTION_GRAPH:
        isApplyingRef.current = true;
        for (const change of (isUndo ? action.before : action.after)) applySingleChange(change, isUndo, ctx);
        isApplyingRef.current = false;
        break;
      case ACTION_PROPERTY_EDIT:
        applyPropertyEditAction(action, isUndo);
        break;
      case ACTION_ANNOTATION:
        applyAnnotationChange?.(action, isUndo);
        break;
    }
  };
}

/**
 * Hook for undo/redo action appliers
 */
export function useUndoRedoAppliers(options: UseUndoRedoAppliersOptions): UseUndoRedoAppliersReturn {
  const {
    setNodePositions, addNode, addEdge, removeNodeAndEdges, removeEdge,
    updateNodes, updateEdges, applyAnnotationChange, isApplyingRef
  } = options;

  const applyAction = useMemo(() => {
    const ctx: ChangeContext = { addNode, addEdge, removeNodeAndEdges, removeEdge, updateNodes, updateEdges };
    return createApplyAction(ctx, setNodePositions, isApplyingRef, applyAnnotationChange);
  }, [addNode, addEdge, removeNodeAndEdges, removeEdge, updateNodes, updateEdges, setNodePositions, isApplyingRef, applyAnnotationChange]);

  return { applyAction };
}
