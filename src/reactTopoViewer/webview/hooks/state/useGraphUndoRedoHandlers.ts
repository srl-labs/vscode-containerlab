import React from "react";

import type { TopoNode, TopoEdge, TopologyEdgeData } from "../../../shared/types/graph";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import {
  createNode,
  createLink,
  editNode,
  editLink,
  createNetworkNode,
  saveEdgeAnnotations,
  type NodeSaveData,
  type LinkSaveData,
  type NetworkNodeData
} from "../../services";
import {
  upsertEdgeLabelOffsetAnnotation,
  type EdgeOffsetUpdateInput
} from "../../utils/edgeAnnotations";

import type {
  GraphChange,
  UndoRedoActionPropertyEdit,
  UndoRedoActionAnnotation,
  UndoRedoActionGroupMove,
  MembershipEntry
} from "./useUndoRedo";
import { useUndoRedo } from "./useUndoRedo";

// Type guards and helper interfaces for node data
interface NodeElementData {
  label?: string;
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

interface MenuHandlers {
  handleDeleteNode: (id: string) => void;
  handleDeleteLink: (id: string) => void;
}

interface EdgeAnnotationHandlers {
  edgeAnnotations: EdgeAnnotation[];
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
}

interface UseGraphUndoRedoHandlersParams {
  mode: "edit" | "view";
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
  applyMembershipChange?: (memberships: MembershipEntry[]) => void;
}

/** Parameters for context-based variant */
interface UseGraphUndoRedoWithContextParams {
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  /** External undoRedo instance from context */
  undoRedo: ReturnType<typeof useUndoRedo>;
  /** Register graph changes handler with context */
  registerGraphHandler: (handler: (changes: GraphChange[]) => void) => void;
  /** Register property edit handler with context */
  registerPropertyEditHandler: (
    handler: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void
  ) => void;
}

interface GraphUndoRedoResult {
  undoRedo: ReturnType<typeof useUndoRedo>;
  handleEdgeCreated: (
    _sourceId: string,
    _targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  handleNodeCreatedCallback: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
  /** Record a property edit for undo/redo */
  recordPropertyEdit: (action: Omit<UndoRedoActionPropertyEdit, "type">) => void;
}

function buildNodeElement(_nodeId: string): TopoNode | null {
  // Disabled during ReactFlow migration
  // TODO: Get node element from React state
  return null;
}

function buildEdgeElement(_edgeId: string): TopoEdge | null {
  // Disabled during ReactFlow migration
  // TODO: Get edge element from React state
  return null;
}

function toEdgeOffsetUpdateInput(data: Record<string, unknown>): EdgeOffsetUpdateInput | null {
  const id = typeof data.id === "string" ? data.id : undefined;
  const source = typeof data.source === "string" ? data.source : undefined;
  const target = typeof data.target === "string" ? data.target : undefined;
  const sourceEndpoint = typeof data.sourceEndpoint === "string" ? data.sourceEndpoint : undefined;
  const targetEndpoint = typeof data.targetEndpoint === "string" ? data.targetEndpoint : undefined;
  const endpointLabelOffsetEnabled =
    typeof data.endpointLabelOffsetEnabled === "boolean"
      ? data.endpointLabelOffsetEnabled
      : undefined;
  const endpointLabelOffset =
    typeof data.endpointLabelOffset === "number" ? data.endpointLabelOffset : undefined;

  if (!id && (!source || !target)) return null;

  return {
    id,
    source,
    target,
    sourceEndpoint,
    targetEndpoint,
    endpointLabelOffsetEnabled,
    endpointLabelOffset
  };
}

function buildConnectedEdges(_nodeId: string): TopoEdge[] {
  // Disabled during ReactFlow migration
  // TODO: Get connected edges from React state
  return [];
}

function cloneNode(node: TopoNode): TopoNode {
  return {
    ...node,
    data: { ...node.data },
    position: node.position ? { ...node.position } : { x: 0, y: 0 }
  } as TopoNode;
}

function cloneEdge(edge: TopoEdge): TopoEdge {
  return {
    ...edge,
    data: edge.data ? { ...edge.data } : undefined
  } as TopoEdge;
}

function stripLinkOffsetFields(data: Record<string, unknown>): Record<string, unknown> {
  const { endpointLabelOffset, endpointLabelOffsetEnabled, ...rest } = data;
  return rest;
}

function isOffsetOnlyLinkChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  return (
    JSON.stringify(stripLinkOffsetFields(before)) === JSON.stringify(stripLinkOffsetFields(after))
  );
}

function getEdgeKeyFromData(data: Record<string, unknown>): string | null {
  const source = data.source as string | undefined;
  const target = data.target as string | undefined;
  const sourceEndpoint = data.sourceEndpoint as string | undefined;
  const targetEndpoint = data.targetEndpoint as string | undefined;
  // Source and target are required
  if (!source || !target) return null;
  // For network links, endpoints might be empty - use node IDs only if no endpoints
  const left = sourceEndpoint ? `${source}:${sourceEndpoint}` : source;
  const right = targetEndpoint ? `${target}:${targetEndpoint}` : target;
  return left < right ? `${left}--${right}` : `${right}--${left}`;
}

function getEdgeKeyFromElement(element: TopoEdge | null | undefined): string | null {
  if (!element) return null;
  const data = element.data as TopologyEdgeData | undefined;
  if (!data) {
    // For edges without data, use source and target
    return element.source && element.target ? `${element.source}--${element.target}` : null;
  }
  return getEdgeKeyFromData({
    source: element.source,
    target: element.target,
    sourceEndpoint: data.sourceEndpoint,
    targetEndpoint: data.targetEndpoint
  });
}

/**
 * Check if a node element is a network/cloud node
 */
function isNetworkNode(data: Record<string, unknown>): boolean {
  return data.topoViewerRole === "cloud" || data.role === "cloud";
}

/**
 * Get the network type from node data
 */
function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = data.extraData as Record<string, unknown> | undefined;
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
}

/**
 * Add a network node (non-bridge type) to annotations
 */
function addNetworkNodeWithPersistence(
  addNode: (n: TopoNode) => void,
  element: TopoNode,
  id: string,
  networkType: NonBridgeNetworkType,
  position: { x: number; y: number }
): void {
  addNode(element);
  const data = element.data as Record<string, unknown>;
  const networkData: NetworkNodeData = {
    id,
    label: (data.label as string) || id,
    type: networkType,
    position
  };
  void createNetworkNode(networkData);
}

function addNodeWithPersistence(
  addNode: (n: TopoNode) => void,
  element: TopoNode,
  id: string
): void {
  const pos = element.position || { x: 0, y: 0 };
  const data = element.data as Record<string, unknown>;

  // Check if this is a network node (cloud)
  if (isNetworkNode(data)) {
    const networkType = getNetworkType(data);
    // Bridge types are stored as YAML nodes
    if (networkType && BRIDGE_NETWORK_TYPES.has(networkType)) {
      addNode(element);
      const nodeData: NodeSaveData = {
        id,
        name: (data.label as string) || id,
        position: pos,
        extraData: { kind: networkType }
      };
      void createNode(nodeData);
    } else if (networkType && SPECIAL_NETWORK_TYPES.has(networkType)) {
      // Non-bridge network types go to networkNodeAnnotations only
      addNetworkNodeWithPersistence(addNode, element, id, networkType as NonBridgeNetworkType, pos);
    } else {
      // Unknown network type, treat as regular node
      addNode(element);
      const nodeData: NodeSaveData = {
        id,
        name: (data.label as string) || id,
        position: pos,
        extraData: mergeNodeExtraData(data as NodeElementData)
      };
      void createNode(nodeData);
    }
    return;
  }

  // Regular node - use standard path
  addNode(element);
  const nodeData: NodeSaveData = {
    id,
    name: (data.label as string) || id,
    position: pos,
    extraData: mergeNodeExtraData(data as NodeElementData)
  };
  void createNode(nodeData);
}

function addEdgeWithPersistence(addEdge: (e: TopoEdge) => void, element: TopoEdge): void {
  // TODO: Check for duplicate edges using React state
  addEdge(element);
  // Create link via TopologyIO service
  const data = element.data as TopologyEdgeData | undefined;
  // Include extraData if present (for special link types like host, vxlan, etc.)
  const extraData = data?.extraData;
  const linkData: LinkSaveData = {
    id: element.id,
    source: element.source,
    target: element.target,
    sourceEndpoint: data?.sourceEndpoint,
    targetEndpoint: data?.targetEndpoint,
    ...(extraData && { extraData })
  };
  void createLink(linkData);
}

function processGraphChange(
  change: GraphChange,
  ctx: {
    addNode: (n: TopoNode) => void;
    addEdge: (e: TopoEdge) => void;
    menuHandlers: MenuHandlers;
  }
): void {
  const element = change.after || change.before;
  if (!element) return;
  const id = element.id;
  if (!id) return;

  if (change.entity === "node") {
    const nodeElement = element as TopoNode;
    const handlers: Record<string, () => void> = {
      add: () => addNodeWithPersistence(ctx.addNode, nodeElement, id),
      delete: () => ctx.menuHandlers.handleDeleteNode(id)
    };
    handlers[change.kind]?.();
  } else if (change.entity === "edge") {
    const edgeElement = element as TopoEdge;
    const handlers: Record<string, () => void> = {
      add: () => addEdgeWithPersistence(ctx.addEdge, edgeElement),
      delete: () => ctx.menuHandlers.handleDeleteLink(id)
    };
    handlers[change.kind]?.();
  }
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
  const id = element?.id;
  if (!id) return;
  if (change.kind === "add") {
    if (seenAdds.has(id)) return;
    seenAdds.add(id);
    buckets.addNodes.push(change);
    return;
  }
  if (change.kind === "delete") {
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
  if (!element || change.entity !== "edge") return;
  const edgeElement = element as TopoEdge;
  const key = getEdgeKeyFromElement(edgeElement);
  if (!key) return;
  if (change.kind === "add") {
    if (seenAdds.has(key)) return;
    seenAdds.add(key);
    buckets.addEdges.push(change);
    return;
  }
  if (change.kind === "delete") {
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

  changes.forEach((change) => {
    if (change.entity === "node") {
      addNodeChangeToBucket(change, buckets, seenNodeAdds, seenNodeDeletes);
      return;
    }
    if (change.entity === "edge") {
      addEdgeChangeToBucket(change, buckets, seenEdgeAdds, seenEdgeDeletes);
    }
  });

  return buckets;
}

function replayGraphChanges(
  changes: GraphChange[],
  ctx: {
    addNode: (n: TopoNode) => void;
    addEdge: (e: TopoEdge) => void;
    menuHandlers: MenuHandlers;
  }
): void {
  const buckets = bucketGraphChanges(changes);
  buckets.addNodes.forEach((change) => processGraphChange(change, ctx));
  buckets.addEdges.forEach((change) => processGraphChange(change, ctx));
  buckets.deleteEdges.forEach((change) => processGraphChange(change, ctx));
  buckets.deleteNodes.forEach((change) => processGraphChange(change, ctx));
}

/** Network types that require special link format */
const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

/** Bridge network types that are stored as YAML nodes */
const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

/** Non-bridge network types that are stored in networkNodeAnnotations only */
type NonBridgeNetworkType = "host" | "mgmt-net" | "macvlan" | "vxlan" | "vxlan-stitch" | "dummy";

/** VXLAN types that have default properties */
const VXLAN_TYPES = new Set(["vxlan", "vxlan-stitch"]);

/** Default VXLAN properties - must match LinkPersistenceIO.ts */
const VXLAN_DEFAULTS = { extRemote: "127.0.0.1", extVni: "100", extDstPort: "4789" };

/** Result of detecting link type */
interface LinkTypeDetectionResult {
  linkType: string;
  cloudNodeId: string;
}

/**
 * Detect the link type based on source/target nodes.
 * Returns the network kind and cloud node ID if either endpoint is a special network node.
 */
function detectLinkType(_sourceId: string, _targetId: string): LinkTypeDetectionResult | undefined {
  // Disabled during ReactFlow migration
  // TODO: Detect link type using React state
  return undefined;
}

function createEdgeCreatedHandler(
  addEdge: (e: TopoEdge) => void,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  // Suppress unused function warning
  void detectLinkType;
  void VXLAN_TYPES;
  void VXLAN_DEFAULTS;

  return (
    _sourceId: string,
    _targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => {
    // Link type detection disabled during ReactFlow migration
    // TODO: Re-implement using React state instead of Cytoscape queries

    // Build edge element
    const edgeEl: TopoEdge = {
      id: edgeData.id,
      source: edgeData.source,
      target: edgeData.target,
      type: "topology-edge",
      data: {
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
        type: "graph",
        before: [{ entity: "edge", kind: "delete", before: cloneEdge(edgeEl) }],
        after: [{ entity: "edge", kind: "add", after: cloneEdge(edgeEl) }]
      });
    }
  };
}

/** Properties that should fallback to top-level data if not in extraData */
const NODE_FALLBACK_PROPS = [
  "kind",
  "type",
  "image",
  "group",
  "topoViewerRole",
  "iconColor",
  "iconCornerRadius",
  "interfacePattern"
] as const;

function mergeNodeExtraData(data: NodeElementData): NodeSaveData["extraData"] {
  const ed = (data.extraData ?? {}) as Record<string, unknown>;
  // Start with all properties from extraData (preserves components, binds, env, etc.)
  const result: Record<string, unknown> = { ...ed };
  // Apply fallbacks for specific properties that might also be at top-level
  for (const key of NODE_FALLBACK_PROPS) {
    if (result[key] === undefined) {
      const topLevelValue = (data as Record<string, unknown>)[key];
      if (topLevelValue !== undefined) {
        result[key] = topLevelValue;
      }
    }
  }
  return result;
}

function buildNodeSaveDataFromElement(
  nodeId: string,
  nodeElement: TopoNode,
  position: { x: number; y: number }
): NodeSaveData {
  const data = nodeElement.data as Record<string, unknown>;
  return {
    id: nodeId,
    name: (data.label as string) || nodeId,
    position,
    extraData: mergeNodeExtraData(data as NodeElementData)
  };
}

/**
 * Persist a newly created node to YAML/annotations based on its type.
 * - Regular nodes: saved to YAML nodes section + nodeAnnotations
 * - Bridge network nodes (bridge, ovs-bridge): saved to YAML nodes section + nodeAnnotations
 * - Other network nodes (host, vxlan, etc.): saved to networkNodeAnnotations only
 */
function persistNewNode(
  nodeId: string,
  nodeElement: TopoNode,
  position: { x: number; y: number }
): void {
  const data = nodeElement.data as Record<string, unknown>;

  // Check if this is a network node (cloud)
  if (isNetworkNode(data)) {
    const networkType = getNetworkType(data);
    // Bridge types are stored as YAML nodes
    if (networkType && BRIDGE_NETWORK_TYPES.has(networkType)) {
      const nodeData: NodeSaveData = {
        id: nodeId,
        name: (data.label as string) || nodeId,
        position,
        extraData: { kind: networkType }
      };
      void createNode(nodeData);
    } else if (networkType && SPECIAL_NETWORK_TYPES.has(networkType)) {
      // Non-bridge network types go to networkNodeAnnotations only
      const networkData: NetworkNodeData = {
        id: nodeId,
        label: (data.label as string) || nodeId,
        type: networkType as NonBridgeNetworkType,
        position
      };
      void createNetworkNode(networkData);
    } else {
      // Unknown network type, treat as regular node
      const nodeData = buildNodeSaveDataFromElement(nodeId, nodeElement, position);
      void createNode(nodeData);
    }
    return;
  }

  // Regular node - use standard path
  const nodeData = buildNodeSaveDataFromElement(nodeId, nodeElement, position);
  void createNode(nodeData);
}

function createNodeCreatedHandler(
  addNode: (n: TopoNode) => void,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  return (nodeId: string, nodeElement: TopoNode, position: { x: number; y: number }) => {
    addNode(nodeElement);
    // Persist node based on its type (regular vs network/cloud)
    persistNewNode(nodeId, nodeElement, position);
    if (!isApplyingUndoRedo.current) {
      const nodeWithPosition: TopoNode = { ...nodeElement, position };
      undoRedo.pushAction({
        type: "graph",
        before: [{ entity: "node", kind: "delete", before: cloneNode(nodeWithPosition) }],
        after: [{ entity: "node", kind: "add", after: cloneNode(nodeWithPosition) }]
      });
    }
  };
}

function createDeleteNodeHandler(
  menuHandlers: MenuHandlers,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  // Suppress unused function warnings
  void buildNodeElement;
  void buildConnectedEdges;
  void undoRedo;
  void isApplyingUndoRedo;

  return (nodeId: string) => {
    // Undo recording disabled during ReactFlow migration
    // TODO: Get node element from React state instead of Cytoscape
    menuHandlers.handleDeleteNode(nodeId);
  };
}

function createDeleteLinkHandler(
  menuHandlers: MenuHandlers,
  undoRedo: ReturnType<typeof useUndoRedo>,
  isApplyingUndoRedo: React.RefObject<boolean>
) {
  // Suppress unused function warnings
  void buildEdgeElement;
  void undoRedo;
  void isApplyingUndoRedo;

  return (edgeId: string) => {
    // Undo recording disabled during ReactFlow migration
    // TODO: Get edge element from React state instead of Cytoscape
    menuHandlers.handleDeleteLink(edgeId);
  };
}

/**
 * Update node visuals after undo/redo property edit
 */
function updateNodeVisuals(_nodeId: string, _data: Record<string, unknown>): void {
  // Disabled during ReactFlow migration
  // TODO: Update node visuals using React state
  // ReactFlow updates visuals automatically when node data changes
}

/**
 * Apply node property edit for undo/redo.
 * For renames, uses editNode with the current name as id.
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

  // Update node visuals
  const nodeIdForVisuals = isRename ? targetNodeName : currentNodeName;
  updateNodeVisuals(nodeIdForVisuals, dataToApply);
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
  if (isOffsetOnlyLinkChange(before, after)) {
    return;
  }
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
    originalTargetEndpoint: currentState.targetEndpoint as string | undefined
  };
  void editLink(linkData);
}

/**
 * Shared helper hook to create applyGraphChanges and applyPropertyEdit callbacks.
 * Used by both useGraphUndoRedoCore and useGraphHandlersWithContext.
 *
 * NOTE: Graph changes replay is disabled during ReactFlow migration.
 */
function useApplyCallbacks(params: {
  addNode: (n: TopoNode) => void;
  addEdge: (e: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { addNode, addEdge, menuHandlers, edgeAnnotationHandlers, isApplyingUndoRedo } = params;

  // Suppress unused warnings - these will be used when ReactFlow undo/redo is implemented
  void addNode;
  void addEdge;
  void menuHandlers;
  void replayGraphChanges;

  const applyGraphChanges = React.useCallback((_changes: GraphChange[]) => {
    // Disabled during ReactFlow migration - graph replay requires Cytoscape
    // TODO: Implement graph changes replay using ReactFlow state
  }, []);

  const applyPropertyEdit = React.useCallback(
    (action: UndoRedoActionPropertyEdit, isUndo: boolean) => {
      isApplyingUndoRedo.current = true;
      try {
        if (action.entityType === "node") {
          applyNodePropertyEdit(action.before, action.after, isUndo);
        } else {
          applyLinkPropertyEdit(action.before, action.after, isUndo);
          if (edgeAnnotationHandlers) {
            const dataToApply = (isUndo ? action.before : action.after) as Record<string, unknown>;
            const update = toEdgeOffsetUpdateInput(dataToApply);
            if (update) {
              const nextAnnotations = upsertEdgeLabelOffsetAnnotation(
                edgeAnnotationHandlers.edgeAnnotations,
                update
              );
              if (nextAnnotations) {
                edgeAnnotationHandlers.setEdgeAnnotations(nextAnnotations);
                void saveEdgeAnnotations(nextAnnotations);
              }
            }
          }
        }
      } finally {
        isApplyingUndoRedo.current = false;
      }
    },
    [edgeAnnotationHandlers, isApplyingUndoRedo]
  );

  return { applyGraphChanges, applyPropertyEdit };
}

/**
 * Shared helper hook to create graph mutation handlers with undo/redo support.
 * Used by both useGraphUndoRedoCore and useGraphHandlersWithContext.
 */
function useGraphMutationHandlers(params: {
  addNode: (n: TopoNode) => void;
  addEdge: (e: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { addNode, addEdge, menuHandlers, undoRedo, isApplyingUndoRedo } = params;

  const handleEdgeCreated = React.useMemo(
    () => createEdgeCreatedHandler(addEdge, undoRedo, isApplyingUndoRedo),
    [addEdge, undoRedo, isApplyingUndoRedo]
  );

  const handleNodeCreatedCallback = React.useMemo(
    () => createNodeCreatedHandler(addNode, undoRedo, isApplyingUndoRedo),
    [addNode, undoRedo, isApplyingUndoRedo]
  );

  const handleDeleteNodeWithUndo = React.useMemo(
    () => createDeleteNodeHandler(menuHandlers, undoRedo, isApplyingUndoRedo),
    [menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  const handleDeleteLinkWithUndo = React.useMemo(
    () => createDeleteLinkHandler(menuHandlers, undoRedo, isApplyingUndoRedo),
    [menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  const recordPropertyEdit = React.useCallback(
    (action: Omit<UndoRedoActionPropertyEdit, "type">) => {
      if (isApplyingUndoRedo.current) return;
      undoRedo.pushAction({
        type: "property-edit",
        ...action
      } as UndoRedoActionPropertyEdit);
    },
    [undoRedo, isApplyingUndoRedo]
  );

  return {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo,
    recordPropertyEdit
  };
}

function useGraphUndoRedoCore(params: UseGraphUndoRedoHandlersParams) {
  const {
    mode,
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  } = params;
  const isApplyingUndoRedo = React.useRef(false);

  const { applyGraphChanges, applyPropertyEdit } = useApplyCallbacks({
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers,
    isApplyingUndoRedo
  });

  const undoRedo = useUndoRedo({
    enabled: mode === "edit",
    applyGraphChanges,
    applyPropertyEdit,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  });

  const handlers = useGraphMutationHandlers({
    addNode,
    addEdge,
    menuHandlers,
    undoRedo,
    isApplyingUndoRedo
  });

  return { undoRedo, ...handlers };
}

export function useGraphUndoRedoHandlers(
  args: UseGraphUndoRedoHandlersParams
): GraphUndoRedoResult {
  return useGraphUndoRedoCore(args);
}

/** Result type for context-based variant (no undoRedo - it comes from context) */
interface GraphHandlersResult {
  handleEdgeCreated: (
    _sourceId: string,
    _targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  handleNodeCreatedCallback: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
  recordPropertyEdit: (action: Omit<UndoRedoActionPropertyEdit, "type">) => void;
}

/**
 * Context-based variant that uses an external undoRedo instance.
 * Registers graph and property edit handlers with the context.
 */
export function useGraphHandlersWithContext(
  params: UseGraphUndoRedoWithContextParams
): GraphHandlersResult {
  const {
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers,
    undoRedo,
    registerGraphHandler,
    registerPropertyEditHandler
  } = params;
  const isApplyingUndoRedo = React.useRef(false);

  const { applyGraphChanges, applyPropertyEdit } = useApplyCallbacks({
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers,
    isApplyingUndoRedo
  });

  // Register handlers with context on mount
  React.useEffect(() => {
    registerGraphHandler(applyGraphChanges);
  }, [registerGraphHandler, applyGraphChanges]);

  React.useEffect(() => {
    registerPropertyEditHandler(applyPropertyEdit);
  }, [registerPropertyEditHandler, applyPropertyEdit]);

  return useGraphMutationHandlers({
    addNode,
    addEdge,
    menuHandlers,
    undoRedo,
    isApplyingUndoRedo
  });
}
