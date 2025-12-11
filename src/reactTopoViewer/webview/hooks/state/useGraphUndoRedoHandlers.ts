import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { CyElement } from '../../../shared/types/messages';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { GraphChange, useUndoRedo, UndoRedoActionPropertyEdit } from './useUndoRedo';

interface MenuHandlers {
  handleDeleteNode: (id: string) => void;
  handleDeleteLink: (id: string) => void;
}

interface UseGraphUndoRedoHandlersParams {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  menuHandlers: MenuHandlers;
}

interface GraphUndoRedoResult {
  undoRedo: ReturnType<typeof useUndoRedo>;
  handleEdgeCreated: (_sourceId: string, _targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => void;
  handleNodeCreatedCallback: (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => void;
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
  /** Record a property edit for undo/redo */
  recordPropertyEdit: (action: Omit<UndoRedoActionPropertyEdit, 'type'>) => void;
}

function buildNodeElement(cy: CyCore | null, nodeId: string): CyElement | null {
  if (!cy) return null;
  const node = cy.getElementById(nodeId);
  if (!node || node.empty() || !node.isNode()) return null;
  const pos = node.position();
  return {
    group: 'nodes',
    data: node.data(),
    position: { x: Math.round(pos.x), y: Math.round(pos.y) }
  };
}

function buildEdgeElement(cy: CyCore | null, edgeId: string): CyElement | null {
  if (!cy) return null;
  const edge = cy.getElementById(edgeId);
  if (!edge || edge.empty() || !edge.isEdge()) return null;
  return {
    group: 'edges',
    data: edge.data()
  };
}

function buildConnectedEdges(cy: CyCore | null, nodeId: string): CyElement[] {
  if (!cy) return [];
  const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
  return edges.map(e => ({ group: 'edges' as const, data: e.data() }));
}

function cloneElement(el: CyElement): CyElement {
  return {
    group: el.group,
    data: { ...(el.data as Record<string, unknown>) },
    position: el.position ? { ...el.position } : undefined
  };
}

function getEdgeKeyFromData(data: Record<string, unknown>): string | null {
  const source = data.source as string | undefined;
  const target = data.target as string | undefined;
  const sourceEndpoint = data.sourceEndpoint as string | undefined;
  const targetEndpoint = data.targetEndpoint as string | undefined;
  if (!source || !target || !sourceEndpoint || !targetEndpoint) return null;
  const left = `${source}:${sourceEndpoint}`;
  const right = `${target}:${targetEndpoint}`;
  return left < right ? `${left}--${right}` : `${right}--${left}`;
}

function getEdgeKeyFromElement(element: CyElement | null | undefined): string | null {
  if (!element?.data) return null;
  return getEdgeKeyFromData(element.data as Record<string, unknown>);
}

function findEdgeByData(cy: CyCore, data: Record<string, unknown>) {
  const id = data.id as string | undefined;
  const byId = id ? cy.getElementById(id) : null;
  if (byId && byId.nonempty()) return byId;
  const targetKey = getEdgeKeyFromData(data);
  if (!targetKey) return cy.collection();
  return cy.edges().filter(e => getEdgeKeyFromData(e.data()) === targetKey).first();
}

function addNodeWithPersistence(cy: CyCore | null, addNode: (n: CyElement) => void, element: CyElement, id: string): void {
  const pos = element.position || { x: 0, y: 0 };
  const exists = cy?.getElementById(id)?.nonempty();
  if (!exists) {
    addNode(element);
    // create-node already saves position via addNode -> saveNodePosition
    sendCommandToExtension('create-node', { nodeId: id, nodeData: element.data, position: pos });
  } else {
    // Only save position if node already exists (undo/redo case)
    sendCommandToExtension('save-node-positions', { positions: [{ id, position: pos }] });
  }
}

function addEdgeWithPersistence(cy: CyCore | null, addEdge: (e: CyElement) => void, element: CyElement): void {
  const targetKey = getEdgeKeyFromElement(element);
  const hasExisting = targetKey && cy?.edges().some(e => getEdgeKeyFromData(e.data()) === targetKey);
  if (hasExisting) return;
  addEdge(element);
  sendCommandToExtension('create-link', {
    linkData: {
      id: (element.data as any)?.id,
      source: (element.data as any)?.source,
      target: (element.data as any)?.target,
      sourceEndpoint: (element.data as any)?.sourceEndpoint,
      targetEndpoint: (element.data as any)?.targetEndpoint
    }
  });
}

function deleteEdgeWithPersistence(
  cy: CyCore | null,
  menuHandlers: MenuHandlers,
  data: Record<string, unknown>
): void {
  const id = data.id as string | undefined;
  const byId = id && cy?.getElementById(id);
  if (byId && byId.nonempty()) {
    menuHandlers.handleDeleteLink(id);
    return;
  }
  if (cy) {
    const match = findEdgeByData(cy, data);
    if (match && match.nonempty()) {
      menuHandlers.handleDeleteLink(match.id());
    }
  }
}

function processGraphChange(
  change: GraphChange,
  ctx: {
    cy: CyCore | null;
    addNode: (n: CyElement) => void;
    addEdge: (e: CyElement) => void;
    menuHandlers: MenuHandlers;
  }
): void {
  const element = change.after || change.before;
  if (!element) return;
  const id = (element.data as any)?.id as string | undefined;
  if (!id) return;

  const handlers: Record<string, () => void> = {
    'add:node': () => addNodeWithPersistence(ctx.cy, ctx.addNode, element, id),
    'add:edge': () => {
      const existing = ctx.cy ? findEdgeByData(ctx.cy, element.data as Record<string, unknown>) : null;
      if (existing && existing.nonempty()) return;
      addEdgeWithPersistence(ctx.cy, ctx.addEdge, element);
    },
    'delete:node': () => ctx.menuHandlers.handleDeleteNode(id),
    'delete:edge': () => deleteEdgeWithPersistence(ctx.cy, ctx.menuHandlers, element.data as Record<string, unknown>)
  };

  handlers[`${change.kind}:${change.entity}`]?.();
}

type GraphBuckets = {
  addNodes: GraphChange[];
  addEdges: GraphChange[];
  deleteEdges: GraphChange[];
  deleteNodes: GraphChange[];
};

function addNodeChangeToBucket(
  change: GraphChange,
  buckets: GraphBuckets,
  seenAdds: Set<string>,
  seenDeletes: Set<string>
): void {
  const element = change.after || change.before;
  const id = (element?.data as any)?.id as string | undefined;
  if (!id) return;
  if (change.kind === 'add') {
    if (seenAdds.has(id)) return;
    seenAdds.add(id);
    buckets.addNodes.push(change);
    return;
  }
  if (change.kind === 'delete') {
    if (seenDeletes.has(id)) return;
    seenDeletes.add(id);
    buckets.deleteNodes.push(change);
  }
}

function addEdgeChangeToBucket(
  change: GraphChange,
  buckets: GraphBuckets,
  seenAdds: Set<string>,
  seenDeletes: Set<string>
): void {
  const element = change.after || change.before;
  const key = getEdgeKeyFromElement(element);
  if (!key) return;
  if (change.kind === 'add') {
    if (seenAdds.has(key)) return;
    seenAdds.add(key);
    buckets.addEdges.push(change);
    return;
  }
  if (change.kind === 'delete') {
    if (seenDeletes.has(key)) return;
    seenDeletes.add(key);
    buckets.deleteEdges.push(change);
  }
}

function bucketGraphChanges(changes: GraphChange[]): GraphBuckets {
  const buckets: GraphBuckets = {
    addNodes: [],
    addEdges: [],
    deleteEdges: [],
    deleteNodes: []
  };

  const seenNodeAdds = new Set<string>();
  const seenNodeDeletes = new Set<string>();
  const seenEdgeAdds = new Set<string>();
  const seenEdgeDeletes = new Set<string>();

  changes.forEach(change => {
    if (change.entity === 'node') {
      addNodeChangeToBucket(change, buckets, seenNodeAdds, seenNodeDeletes);
      return;
    }
    if (change.entity === 'edge') {
      addEdgeChangeToBucket(change, buckets, seenEdgeAdds, seenEdgeDeletes);
    }
  });

  return buckets;
}

function replayGraphChanges(changes: GraphChange[], ctx: { cy: CyCore | null; addNode: (n: CyElement) => void; addEdge: (e: CyElement) => void; menuHandlers: MenuHandlers }): void {
  const buckets = bucketGraphChanges(changes);
  buckets.addNodes.forEach(change => processGraphChange(change, ctx));
  buckets.addEdges.forEach(change => processGraphChange(change, ctx));
  buckets.deleteEdges.forEach(change => processGraphChange(change, ctx));
  buckets.deleteNodes.forEach(change => processGraphChange(change, ctx));
}

function createEdgeCreatedHandler(
  addEdge: (e: CyElement) => void,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (_sourceId: string, _targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => {
    const edgeEl = {
      group: 'edges' as const,
      data: {
        id: edgeData.id,
        source: edgeData.source,
        target: edgeData.target,
        sourceEndpoint: edgeData.sourceEndpoint,
        targetEndpoint: edgeData.targetEndpoint
      }
    };
    addEdge(edgeEl);
    sendCommandToExtension('create-link', { linkData: edgeData });

    if (!isApplyingUndoRedo.current) {
      undoRedo.pushAction({
        type: 'graph',
        before: [{ entity: 'edge', kind: 'delete', before: cloneElement(edgeEl) }],
        after: [{ entity: 'edge', kind: 'add', after: cloneElement(edgeEl) }]
      });
    }
  };
}

function createNodeCreatedHandler(
  addNode: (n: CyElement) => void,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => {
    addNode(nodeElement);
    // Note: create-node already saves position via addNode -> saveNodePosition
    // Don't send save-node-positions here to avoid race condition / file corruption
    sendCommandToExtension('create-node', { nodeId, nodeData: nodeElement.data, position });
    if (!isApplyingUndoRedo.current) {
      undoRedo.pushAction({
        type: 'graph',
        before: [{ entity: 'node', kind: 'delete', before: cloneElement({ ...nodeElement, position }) }],
        after: [{ entity: 'node', kind: 'add', after: cloneElement({ ...nodeElement, position }) }]
      });
    }
  };
}

function createDeleteNodeHandler(
  cyInstance: CyCore | null,
  menuHandlers: MenuHandlers,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (nodeId: string) => {
    const nodeEl = buildNodeElement(cyInstance, nodeId);
    const edgeEls = buildConnectedEdges(cyInstance, nodeId);
    menuHandlers.handleDeleteNode(nodeId);
    if (!isApplyingUndoRedo.current && nodeEl) {
      undoRedo.pushAction({
        type: 'graph',
        before: [
          { entity: 'node', kind: 'add', after: cloneElement(nodeEl) },
          ...edgeEls.map(el => ({ entity: 'edge' as const, kind: 'add' as const, after: cloneElement(el) }))
        ],
        after: [{ entity: 'node', kind: 'delete', before: cloneElement(nodeEl) }]
      });
    }
  };
}

function createDeleteLinkHandler(
  cyInstance: CyCore | null,
  menuHandlers: MenuHandlers,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (edgeId: string) => {
    const edgeEl = buildEdgeElement(cyInstance, edgeId);
    menuHandlers.handleDeleteLink(edgeId);
    if (!isApplyingUndoRedo.current && edgeEl) {
      undoRedo.pushAction({
        type: 'graph',
        before: [{ entity: 'edge', kind: 'add', after: cloneElement(edgeEl) }],
        after: [{ entity: 'edge', kind: 'delete', before: cloneElement(edgeEl) }]
      });
    }
  };
}

/**
 * Apply node property edit for undo/redo.
 * For renames, uses explicit rename command that handles finding the node robustly.
 */
function applyNodePropertyEdit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  isUndo: boolean
): void {
  const dataToApply = isUndo ? before : after;
  const beforeName = before.name as string;
  const afterName = after.name as string;
  const isRename = beforeName !== afterName;

  if (isRename) {
    // For renames, we need to handle the case where YAML doc may be reloaded.
    // Send both current and target names so extension can find the right node.
    const currentNodeName = isUndo ? afterName : beforeName;
    const targetNodeName = isUndo ? beforeName : afterName;

    sendCommandToExtension('undo-rename-node', {
      currentName: currentNodeName,
      targetName: targetNodeName,
      nodeData: dataToApply
    });
  } else {
    sendCommandToExtension('apply-node-editor', { nodeData: dataToApply });
  }
}

/**
 * Apply link property edit for undo/redo.
 * Uses original endpoint values to find the link by its current state.
 */
function applyLinkPropertyEdit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  isUndo: boolean
): void {
  const dataToApply = isUndo ? before : after;
  // Current link endpoints are from the "other" state (the one we're NOT applying)
  const currentState = isUndo ? after : before;

  const linkData = {
    ...dataToApply,
    originalSource: currentState.source,
    originalTarget: currentState.target,
    originalSourceEndpoint: currentState.sourceEndpoint,
    originalTargetEndpoint: currentState.targetEndpoint,
  };
  sendCommandToExtension('apply-link-editor', { linkData });
}

function useGraphUndoRedoCore(params: UseGraphUndoRedoHandlersParams) {
  const { cyInstance, mode, addNode, addEdge, menuHandlers } = params;
  const isApplyingUndoRedo = React.useRef(false);

  const applyGraphChanges = React.useCallback((changes: GraphChange[]) => {
    if (!cyInstance) return;
    isApplyingUndoRedo.current = true;
    sendCommandToExtension('begin-graph-batch', {});
    try {
      replayGraphChanges(changes, { cy: cyInstance, addNode, addEdge, menuHandlers });
    } finally {
      sendCommandToExtension('end-graph-batch', {});
      isApplyingUndoRedo.current = false;
    }
  }, [cyInstance, addNode, addEdge, menuHandlers]);

  // Handler for applying property edits (node/link editor changes) during undo/redo
  const applyPropertyEdit = React.useCallback((
    action: UndoRedoActionPropertyEdit,
    isUndo: boolean
  ) => {
    isApplyingUndoRedo.current = true;
    try {
      if (action.entityType === 'node') {
        applyNodePropertyEdit(action.before, action.after, isUndo);
      } else {
        applyLinkPropertyEdit(action.before, action.after, isUndo);
      }
    } finally {
      isApplyingUndoRedo.current = false;
    }
  }, []);

  const undoRedo = useUndoRedo({
    cy: cyInstance,
    enabled: mode === 'edit',
    applyGraphChanges,
    applyPropertyEdit
  });

  // Create handlers using useMemo with factory functions
  const handleEdgeCreated = React.useMemo(
    () => createEdgeCreatedHandler(addEdge, undoRedo, isApplyingUndoRedo),
    [addEdge, undoRedo]
  );

  const handleNodeCreatedCallback = React.useMemo(
    () => createNodeCreatedHandler(addNode, undoRedo, isApplyingUndoRedo),
    [addNode, undoRedo]
  );

  const handleDeleteNodeWithUndo = React.useMemo(
    () => createDeleteNodeHandler(cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo),
    [cyInstance, menuHandlers, undoRedo]
  );

  const handleDeleteLinkWithUndo = React.useMemo(
    () => createDeleteLinkHandler(cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo),
    [cyInstance, menuHandlers, undoRedo]
  );

  // Function to record a property edit action for undo/redo
  const recordPropertyEdit = React.useCallback((
    action: Omit<UndoRedoActionPropertyEdit, 'type'>
  ) => {
    if (isApplyingUndoRedo.current) return; // Don't record during undo/redo replay
    undoRedo.pushAction({
      type: 'property-edit',
      ...action
    });
  }, [undoRedo]);

  return { undoRedo, handleEdgeCreated, handleNodeCreatedCallback, handleDeleteNodeWithUndo, handleDeleteLinkWithUndo, recordPropertyEdit };
}

export function useGraphUndoRedoHandlers(args: UseGraphUndoRedoHandlersParams): GraphUndoRedoResult {
  return useGraphUndoRedoCore(args);
}
