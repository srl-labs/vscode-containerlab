/**
 * Delete Handlers with Undo/Redo Support
 * Handles node and edge deletion with undo capability
 */
import type React from 'react';
import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';

import type { CyElement } from '../../../shared/types/messages';
import type { GraphChange, UndoRedoAction } from '../state/useUndoRedo';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';

/** Convert React Flow node to CyElement format */
function nodeToCyElement(node: Node): CyElement {
  const data = node.data as Record<string, unknown>;
  return {
    group: 'nodes',
    data: {
      id: node.id,
      name: data.label || node.id,
      ...data,
      extraData: {
        ...(data.extraData as Record<string, unknown> || {}),
        position: { x: node.position.x, y: node.position.y }
      }
    }
  };
}

/** Convert React Flow edge to CyElement format */
function edgeToCyElement(edge: Edge): CyElement {
  const data = edge.data as Record<string, unknown> || {};
  return {
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceEndpoint: data.sourceEndpoint || '',
      targetEndpoint: data.targetEndpoint || '',
      ...data
    }
  };
}

/** Build graph changes for node deletion */
function buildNodeDeleteChanges(node: Node, connectedEdges: Edge[]): { before: GraphChange[]; after: GraphChange[] } {
  const nodeElement = nodeToCyElement(node);
  const edgeElements = connectedEdges.map(edgeToCyElement);
  const beforeChanges: GraphChange[] = [
    { entity: 'node', kind: 'delete', before: nodeElement },
    ...edgeElements.map(e => ({ entity: 'edge' as const, kind: 'delete' as const, before: e }))
  ];
  const afterChanges: GraphChange[] = [
    { entity: 'node', kind: 'delete', after: nodeElement },
    ...edgeElements.map(e => ({ entity: 'edge' as const, kind: 'delete' as const, after: e }))
  ];
  return { before: beforeChanges, after: afterChanges };
}

/** Build graph changes for edge deletion */
function buildEdgeDeleteChanges(edge: Edge): { before: GraphChange[]; after: GraphChange[] } {
  const edgeElement = edgeToCyElement(edge);
  return {
    before: [{ entity: 'edge', kind: 'delete', before: edgeElement }],
    after: [{ entity: 'edge', kind: 'delete', after: edgeElement }]
  };
}

/** Send edge delete command to extension */
function sendEdgeDeleteCommand(edge: Edge, edgeId: string): void {
  const edgeData = edge.data as Record<string, unknown> | undefined;
  sendCommandToExtension('panel-delete-link', {
    edgeId,
    linkData: {
      source: edge.source,
      target: edge.target,
      sourceEndpoint: edgeData?.sourceEndpoint || '',
      targetEndpoint: edgeData?.targetEndpoint || ''
    }
  });
}

export interface UseUndoRedoDeleteHandlersOptions {
  isEnabled: boolean;
  isApplyingRef: React.RefObject<boolean>;
  getNodes: () => Node[];
  getEdges: () => Edge[];
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  pushAction: (action: UndoRedoAction) => void;
}

export interface UseUndoRedoDeleteHandlersReturn {
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
}

/** Delete context for passing to handlers */
interface DeleteContext {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  pushAction: (action: UndoRedoAction) => void;
}

/** Create node delete handler */
function createNodeDeleteHandler(ctx: DeleteContext, isEnabled: boolean, isApplyingRef: React.RefObject<boolean>) {
  return (nodeId: string) => {
    if (!isEnabled || isApplyingRef.current) return;
    const node = ctx.getNodes().find(n => n.id === nodeId);
    if (!node) { log.warn(`[UndoRedo] Cannot delete node ${nodeId} - not found`); return; }

    const connectedEdges = ctx.getEdges().filter(e => e.source === nodeId || e.target === nodeId);
    const { before, after } = buildNodeDeleteChanges(node, connectedEdges);
    ctx.pushAction({ type: 'graph', before, after });

    log.info(`[UndoRedo] Deleting node ${nodeId} with ${connectedEdges.length} connected edges`);
    ctx.removeNodeAndEdges(nodeId);
    ctx.updateNodes(nds => nds.filter(n => n.id !== nodeId));
    ctx.updateEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    sendCommandToExtension('panel-delete-node', { nodeId });
  };
}

/** Create edge delete handler */
function createEdgeDeleteHandler(ctx: DeleteContext, isEnabled: boolean, isApplyingRef: React.RefObject<boolean>) {
  return (edgeId: string) => {
    if (!isEnabled || isApplyingRef.current) return;
    const edge = ctx.getEdges().find(e => e.id === edgeId);
    if (!edge) { log.warn(`[UndoRedo] Cannot delete edge ${edgeId} - not found`); return; }

    const { before, after } = buildEdgeDeleteChanges(edge);
    ctx.pushAction({ type: 'graph', before, after });

    log.info(`[UndoRedo] Deleting edge ${edgeId}`);
    ctx.removeEdge(edgeId);
    ctx.updateEdges(eds => eds.filter(e => e.id !== edgeId));
    sendEdgeDeleteCommand(edge, edgeId);
  };
}

/**
 * Hook for delete operations with undo/redo support
 */
export function useUndoRedoDeleteHandlers(options: UseUndoRedoDeleteHandlersOptions): UseUndoRedoDeleteHandlersReturn {
  const {
    isEnabled, isApplyingRef, getNodes, getEdges,
    removeNodeAndEdges, removeEdge, updateNodes, updateEdges, pushAction
  } = options;

  return useMemo(() => {
    const ctx: DeleteContext = { getNodes, getEdges, removeNodeAndEdges, removeEdge, updateNodes, updateEdges, pushAction };
    return {
      handleDeleteNodeWithUndo: createNodeDeleteHandler(ctx, isEnabled, isApplyingRef),
      handleDeleteLinkWithUndo: createEdgeDeleteHandler(ctx, isEnabled, isApplyingRef)
    };
  }, [isEnabled, isApplyingRef, getNodes, getEdges, removeNodeAndEdges, removeEdge, updateNodes, updateEdges, pushAction]);
}
