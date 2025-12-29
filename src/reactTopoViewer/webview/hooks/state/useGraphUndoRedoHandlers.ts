import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import {
  createNode,
  createLink,
  editNode,
  editLink,
  saveNodePositions,
  beginBatch,
  endBatch,
  type NodeSaveData,
  type LinkSaveData
} from '../../services';
import { generateEncodedSVG, type NodeType } from '../../utils/SvgGenerator';
import { ROLE_SVG_MAP } from '../../components/canvas/styles';

import type { GraphChange, UndoRedoActionPropertyEdit, UndoRedoActionAnnotation, UndoRedoActionGroupMove, MembershipEntry } from './useUndoRedo';
import { useUndoRedo } from './useUndoRedo';

// Type guards and helper interfaces for CyElement data
interface NodeElementData {
  id: string;
  name?: string;
  kind?: string;
  type?: string;
  image?: string;
  group?: string;
  topoViewerRole?: unknown;
  iconColor?: unknown;
  iconCornerRadius?: unknown;
  interfacePattern?: unknown;
  extraData?: {
    kind?: string;
    type?: string;
    image?: string;
    group?: string;
    topoViewerRole?: unknown;
    iconColor?: unknown;
    iconCornerRadius?: unknown;
    interfacePattern?: unknown;
  };
  [key: string]: unknown;
}

interface EdgeElementData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

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
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
  applyMembershipChange?: (memberships: MembershipEntry[]) => void;
}

/** Parameters for context-based variant */
interface UseGraphUndoRedoWithContextParams {
  cyInstance: CyCore | null;
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  menuHandlers: MenuHandlers;
  /** External undoRedo instance from context */
  undoRedo: ReturnType<typeof useUndoRedo>;
  /** Register graph changes handler with context */
  registerGraphHandler: (handler: (changes: GraphChange[]) => void) => void;
  /** Register property edit handler with context */
  registerPropertyEditHandler: (handler: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void) => void;
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
    data: node.data() as Record<string, unknown>,
    position: { x: Math.round(pos.x), y: Math.round(pos.y) }
  };
}

function buildEdgeElement(cy: CyCore | null, edgeId: string): CyElement | null {
  if (!cy) return null;
  const edge = cy.getElementById(edgeId);
  if (!edge || edge.empty() || !edge.isEdge()) return null;
  return {
    group: 'edges',
    data: edge.data() as Record<string, unknown>
  };
}

function buildConnectedEdges(cy: CyCore | null, nodeId: string): CyElement[] {
  if (!cy) return [];
  const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
  return edges.map(e => ({ group: 'edges' as const, data: e.data() as Record<string, unknown> }));
}

function cloneElement(el: CyElement): CyElement {
  return {
    group: el.group,
    data: { ...el.data },
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
  return getEdgeKeyFromData(element.data);
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
    // Create node via TopologyIO service
    // Note: TopologyParser stores properties in data.extraData, so we need to merge them
    const data = element.data as NodeElementData;
    const nodeData: NodeSaveData = {
      id,
      name: (data.name as string) || id,
      position: pos,
      extraData: mergeNodeExtraData(data)
    };
    void createNode(nodeData);
  } else {
    // Only save position if node already exists (undo/redo case)
    void saveNodePositions([{ id, position: pos }]);
  }
}

function addEdgeWithPersistence(cy: CyCore | null, addEdge: (e: CyElement) => void, element: CyElement): void {
  const targetKey = getEdgeKeyFromElement(element);
  const hasExisting = targetKey && cy?.edges().some(e => getEdgeKeyFromData(e.data()) === targetKey);
  if (hasExisting) return;
  addEdge(element);
  // Create link via TopologyIO service
  const data = element.data as EdgeElementData;
  const linkData: LinkSaveData = {
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint: data.sourceEndpoint,
    targetEndpoint: data.targetEndpoint
  };
  void createLink(linkData);
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
  const data = element.data as { id?: string };
  const id = data.id;
  if (!id) return;

  const handlers: Record<string, () => void> = {
    'add:node': () => addNodeWithPersistence(ctx.cy, ctx.addNode, element, id),
    'add:edge': () => {
      const existing = ctx.cy ? findEdgeByData(ctx.cy, element.data) : null;
      if (existing && existing.nonempty()) return;
      addEdgeWithPersistence(ctx.cy, ctx.addEdge, element);
    },
    'delete:node': () => ctx.menuHandlers.handleDeleteNode(id),
    'delete:edge': () => deleteEdgeWithPersistence(ctx.cy, ctx.menuHandlers, element.data)
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
  const data = element?.data as { id?: string } | undefined;
  const id = data?.id;
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
    // Create link via TopologyIO service
    const linkData: LinkSaveData = {
      id: edgeData.id,
      source: edgeData.source,
      target: edgeData.target,
      sourceEndpoint: edgeData.sourceEndpoint,
      targetEndpoint: edgeData.targetEndpoint
    };
    void createLink(linkData);

    if (!isApplyingUndoRedo.current) {
      undoRedo.pushAction({
        type: 'graph',
        before: [{ entity: 'edge', kind: 'delete', before: cloneElement(edgeEl) }],
        after: [{ entity: 'edge', kind: 'add', after: cloneElement(edgeEl) }]
      });
    }
  };
}

/** Properties to merge from extraData with top-level fallback */
const NODE_MERGE_PROPS = ['kind', 'type', 'image', 'group', 'topoViewerRole', 'iconColor', 'iconCornerRadius', 'interfacePattern'] as const;

function mergeNodeExtraData(data: NodeElementData): NodeSaveData['extraData'] {
  const ed = (data.extraData ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of NODE_MERGE_PROPS) {
    result[key] = ed[key] ?? (data as Record<string, unknown>)[key];
  }
  return result;
}

function buildNodeSaveDataFromElement(nodeId: string, nodeElement: CyElement, position: { x: number; y: number }): NodeSaveData {
  const data = nodeElement.data as NodeElementData;
  return {
    id: nodeId,
    name: (data.name as string) || nodeId,
    position,
    extraData: mergeNodeExtraData(data)
  };
}

function createNodeCreatedHandler(
  addNode: (n: CyElement) => void,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => {
    addNode(nodeElement);
    // Create node via TopologyIO service
    const nodeData = buildNodeSaveDataFromElement(nodeId, nodeElement, position);
    void createNode(nodeData);
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

/** Default icon color used when no custom color is set */
const DEFAULT_ICON_COLOR = '#005aff';

/**
 * Update Cytoscape node visuals after undo/redo property edit
 */
function updateCytoscapeNodeVisuals(
  cy: CyCore | null,
  nodeId: string,
  data: Record<string, unknown>
): void {
  if (!cy) return;

  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  // Update node data
  node.data('name', data.name);
  node.data('topoViewerRole', data.icon);
  node.data('iconColor', data.iconColor);
  node.data('iconCornerRadius', data.iconCornerRadius);

  // Update background-image style for iconColor
  const role = (data.icon as string) || 'default';
  const svgType = ROLE_SVG_MAP[role] as NodeType | undefined;
  if (svgType) {
    const color = (data.iconColor as string) || DEFAULT_ICON_COLOR;
    node.style('background-image', generateEncodedSVG(svgType, color));
  }

  // Update shape/corner-radius
  const cornerRadius = data.iconCornerRadius as number | undefined;
  if (cornerRadius !== undefined && cornerRadius > 0) {
    node.style('shape', 'round-rectangle');
    node.style('corner-radius', cornerRadius);
  } else {
    node.style('shape', 'rectangle');
  }
}

/**
 * Apply node property edit for undo/redo.
 * For renames, uses editNode with the current name as id.
 */
function applyNodePropertyEdit(
  cy: CyCore | null,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  isUndo: boolean
): void {
  const dataToApply = isUndo ? before : after;
  const beforeName = before.name as string;
  const afterName = after.name as string;
  const isRename = beforeName !== afterName;

  // For renames, current name is the one in the file (before if redo, after if undo)
  const currentNodeName = isUndo ? afterName : beforeName;
  const targetNodeName = isUndo ? beforeName : afterName;

  // Build NodeSaveData for editNode
  const nodeData: NodeSaveData = {
    id: currentNodeName,
    name: isRename ? targetNodeName : currentNodeName,
    extraData: {
      kind: dataToApply.kind as string | undefined,
      image: dataToApply.image as string | undefined,
      group: dataToApply.group as string | undefined,
      topoViewerRole: dataToApply.topoViewerRole,
      iconColor: dataToApply.iconColor,
      iconCornerRadius: dataToApply.iconCornerRadius,
      interfacePattern: dataToApply.interfacePattern
    }
  };
  void editNode(nodeData);

  // Update Cytoscape canvas visuals
  const nodeIdForVisuals = isRename ? targetNodeName : currentNodeName;
  updateCytoscapeNodeVisuals(cy, nodeIdForVisuals, dataToApply);
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

  // Build LinkSaveData for editLink
  const linkData: LinkSaveData = {
    id: dataToApply.id as string,
    source: dataToApply.source as string,
    target: dataToApply.target as string,
    sourceEndpoint: dataToApply.sourceEndpoint as string | undefined,
    targetEndpoint: dataToApply.targetEndpoint as string | undefined,
    // Original values to find the link in YAML
    originalSource: currentState.source as string,
    originalTarget: currentState.target as string,
    originalSourceEndpoint: currentState.sourceEndpoint as string | undefined,
    originalTargetEndpoint: currentState.targetEndpoint as string | undefined,
  };
  void editLink(linkData);
}

/**
 * Shared helper hook to create applyGraphChanges and applyPropertyEdit callbacks.
 * Used by both useGraphUndoRedoCore and useGraphHandlersWithContext.
 */
function useApplyCallbacks(params: {
  cyInstance: CyCore | null;
  addNode: (n: CyElement) => void;
  addEdge: (e: CyElement) => void;
  menuHandlers: MenuHandlers;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { cyInstance, addNode, addEdge, menuHandlers, isApplyingUndoRedo } = params;

  const applyGraphChanges = React.useCallback((changes: GraphChange[]) => {
    if (!cyInstance) return;
    isApplyingUndoRedo.current = true;
    beginBatch();
    try {
      replayGraphChanges(changes, { cy: cyInstance, addNode, addEdge, menuHandlers });
    } finally {
      void endBatch();
      isApplyingUndoRedo.current = false;
    }
  }, [cyInstance, addNode, addEdge, menuHandlers, isApplyingUndoRedo]);

  const applyPropertyEdit = React.useCallback((
    action: UndoRedoActionPropertyEdit,
    isUndo: boolean
  ) => {
    isApplyingUndoRedo.current = true;
    try {
      if (action.entityType === 'node') {
        applyNodePropertyEdit(cyInstance, action.before, action.after, isUndo);
      } else {
        applyLinkPropertyEdit(action.before, action.after, isUndo);
      }
    } finally {
      isApplyingUndoRedo.current = false;
    }
  }, [cyInstance, isApplyingUndoRedo]);

  return { applyGraphChanges, applyPropertyEdit };
}

/**
 * Shared helper hook to create graph mutation handlers with undo/redo support.
 * Used by both useGraphUndoRedoCore and useGraphHandlersWithContext.
 */
function useGraphMutationHandlers(params: {
  cyInstance: CyCore | null;
  addNode: (n: CyElement) => void;
  addEdge: (e: CyElement) => void;
  menuHandlers: MenuHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { cyInstance, addNode, addEdge, menuHandlers, undoRedo, isApplyingUndoRedo } = params;

  const handleEdgeCreated = React.useMemo(
    () => createEdgeCreatedHandler(addEdge, undoRedo, isApplyingUndoRedo),
    [addEdge, undoRedo, isApplyingUndoRedo]
  );

  const handleNodeCreatedCallback = React.useMemo(
    () => createNodeCreatedHandler(addNode, undoRedo, isApplyingUndoRedo),
    [addNode, undoRedo, isApplyingUndoRedo]
  );

  const handleDeleteNodeWithUndo = React.useMemo(
    () => createDeleteNodeHandler(cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo),
    [cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  const handleDeleteLinkWithUndo = React.useMemo(
    () => createDeleteLinkHandler(cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo),
    [cyInstance, menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  const recordPropertyEdit = React.useCallback((
    action: Omit<UndoRedoActionPropertyEdit, 'type'>
  ) => {
    if (isApplyingUndoRedo.current) return;
    undoRedo.pushAction({
      type: 'property-edit',
      ...action
    } as UndoRedoActionPropertyEdit);
  }, [undoRedo, isApplyingUndoRedo]);

  return { handleEdgeCreated, handleNodeCreatedCallback, handleDeleteNodeWithUndo, handleDeleteLinkWithUndo, recordPropertyEdit };
}

function useGraphUndoRedoCore(params: UseGraphUndoRedoHandlersParams) {
  const { cyInstance, mode, addNode, addEdge, menuHandlers, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange } = params;
  const isApplyingUndoRedo = React.useRef(false);

  const { applyGraphChanges, applyPropertyEdit } = useApplyCallbacks({
    cyInstance, addNode, addEdge, menuHandlers, isApplyingUndoRedo
  });

  const undoRedo = useUndoRedo({
    cy: cyInstance,
    enabled: mode === 'edit',
    applyGraphChanges,
    applyPropertyEdit,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  });

  const handlers = useGraphMutationHandlers({
    cyInstance, addNode, addEdge, menuHandlers, undoRedo, isApplyingUndoRedo
  });

  return { undoRedo, ...handlers };
}

export function useGraphUndoRedoHandlers(args: UseGraphUndoRedoHandlersParams): GraphUndoRedoResult {
  return useGraphUndoRedoCore(args);
}

/** Result type for context-based variant (no undoRedo - it comes from context) */
interface GraphHandlersResult {
  handleEdgeCreated: (_sourceId: string, _targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => void;
  handleNodeCreatedCallback: (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => void;
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
  recordPropertyEdit: (action: Omit<UndoRedoActionPropertyEdit, 'type'>) => void;
}

/**
 * Context-based variant that uses an external undoRedo instance.
 * Registers graph and property edit handlers with the context.
 */
export function useGraphHandlersWithContext(params: UseGraphUndoRedoWithContextParams): GraphHandlersResult {
  const { cyInstance, addNode, addEdge, menuHandlers, undoRedo, registerGraphHandler, registerPropertyEditHandler } = params;
  const isApplyingUndoRedo = React.useRef(false);

  const { applyGraphChanges, applyPropertyEdit } = useApplyCallbacks({
    cyInstance, addNode, addEdge, menuHandlers, isApplyingUndoRedo
  });

  // Register handlers with context on mount
  React.useEffect(() => {
    registerGraphHandler(applyGraphChanges);
  }, [registerGraphHandler, applyGraphChanges]);

  React.useEffect(() => {
    registerPropertyEditHandler(applyPropertyEdit);
  }, [registerPropertyEditHandler, applyPropertyEdit]);

  return useGraphMutationHandlers({
    cyInstance, addNode, addEdge, menuHandlers, undoRedo, isApplyingUndoRedo
  });
}
