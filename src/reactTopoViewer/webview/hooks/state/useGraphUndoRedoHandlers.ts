/**
 * Graph Undo/Redo Handlers
 * Provides handlers for graph mutations (create, delete) with undo/redo support.
 * Uses ReactFlow state for proper node/edge queries.
 */
import React from "react";
import type { Node, Edge } from "@xyflow/react";

import type { TopoNode, TopoEdge, TopologyEdgeData } from "../../../shared/types/graph";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import {
  createNode,
  createLink,
  deleteNode,
  deleteLink,
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
import { log } from "../../utils/logger";

import type { GraphChange, UndoRedoActionPropertyEdit } from "./useUndoRedo";
import { useUndoRedo } from "./useUndoRedo";

// ============================================================================
// Types
// ============================================================================

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
  getNodes: () => Node[];
  getEdges: () => Edge[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  applyAnnotationChange?: (action: unknown, isUndo: boolean) => void;
  applyGroupMoveChange?: (action: unknown, isUndo: boolean) => void;
  applyMembershipChange?: (memberships: unknown[]) => void;
}

interface UseGraphUndoRedoWithContextParams {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
  registerGraphHandler: (handler: (changes: GraphChange[]) => void) => void;
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
  recordPropertyEdit: (action: Omit<UndoRedoActionPropertyEdit, "type">) => void;
}

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

// ============================================================================
// Node Data Helpers
// ============================================================================

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
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Network types stored in networkNodeAnnotations (not YAML nodes) */
const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

/** Bridge types stored as YAML nodes */
const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

type NonBridgeNetworkType = "host" | "mgmt-net" | "macvlan" | "vxlan" | "vxlan-stitch" | "dummy";

/** Properties that fall back to top-level data if not in extraData */
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

function isNetworkNode(data: Record<string, unknown>): boolean {
  return data.topoViewerRole === "cloud" || data.role === "cloud";
}

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

function mergeNodeExtraData(data: NodeElementData): NodeSaveData["extraData"] {
  const ed = (data.extraData ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = { ...ed };
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

// ============================================================================
// Clone Helpers
// ============================================================================

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

// ============================================================================
// Persistence Helpers
// ============================================================================

function persistNewNode(
  nodeId: string,
  nodeElement: TopoNode,
  position: { x: number; y: number }
): void {
  const data = nodeElement.data as Record<string, unknown>;

  if (isNetworkNode(data)) {
    const networkType = getNetworkType(data);
    if (networkType && BRIDGE_NETWORK_TYPES.has(networkType)) {
      const nodeData: NodeSaveData = {
        id: nodeId,
        name: (data.label as string) || nodeId,
        position,
        extraData: { kind: networkType }
      };
      void createNode(nodeData);
    } else if (networkType && SPECIAL_NETWORK_TYPES.has(networkType)) {
      const networkData: NetworkNodeData = {
        id: nodeId,
        label: (data.label as string) || nodeId,
        type: networkType as NonBridgeNetworkType,
        position
      };
      void createNetworkNode(networkData);
    } else {
      const nodeData: NodeSaveData = {
        id: nodeId,
        name: (data.label as string) || nodeId,
        position,
        extraData: mergeNodeExtraData(data as NodeElementData)
      };
      void createNode(nodeData);
    }
    return;
  }

  const nodeData: NodeSaveData = {
    id: nodeId,
    name: (data.label as string) || nodeId,
    position,
    extraData: mergeNodeExtraData(data as NodeElementData)
  };
  void createNode(nodeData);
}

// ============================================================================
// Property Edit Helpers
// ============================================================================

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

function applyNodePropertyEdit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  isUndo: boolean
): void {
  const dataToApply = isUndo ? before : after;
  const beforeName = before.name as string;
  const afterName = after.name as string;
  const isRename = beforeName !== afterName;
  const currentNodeName = isUndo ? afterName : beforeName;
  const targetNodeName = isUndo ? beforeName : afterName;

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
}

function applyLinkPropertyEdit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  isUndo: boolean
): void {
  if (isOffsetOnlyLinkChange(before, after)) return;

  const dataToApply = isUndo ? before : after;
  const currentState = isUndo ? after : before;

  const linkData: LinkSaveData = {
    id: dataToApply.id as string,
    source: dataToApply.source as string,
    target: dataToApply.target as string,
    sourceEndpoint: dataToApply.sourceEndpoint as string | undefined,
    targetEndpoint: dataToApply.targetEndpoint as string | undefined,
    originalSource: currentState.source as string,
    originalTarget: currentState.target as string,
    originalSourceEndpoint: currentState.sourceEndpoint as string | undefined,
    originalTargetEndpoint: currentState.targetEndpoint as string | undefined
  };
  void editLink(linkData);
}

// ============================================================================
// Graph Change Replay
// ============================================================================

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
    if (change.kind === "add") {
      ctx.addNode(nodeElement);
      const pos = nodeElement.position || { x: 0, y: 0 };
      persistNewNode(id, nodeElement, pos);
    } else if (change.kind === "delete") {
      void deleteNode(id);
      ctx.menuHandlers.handleDeleteNode(id);
    }
  } else if (change.entity === "edge") {
    const edgeElement = element as TopoEdge;
    const data = edgeElement.data as TopologyEdgeData | undefined;
    const linkData: LinkSaveData = {
      id: edgeElement.id,
      source: edgeElement.source,
      target: edgeElement.target,
      sourceEndpoint: data?.sourceEndpoint,
      targetEndpoint: data?.targetEndpoint,
      ...(data?.extraData && { extraData: data.extraData })
    };
    if (change.kind === "add") {
      ctx.addEdge(edgeElement);
      void createLink(linkData);
    } else if (change.kind === "delete") {
      void deleteLink(linkData);
      ctx.menuHandlers.handleDeleteLink(id);
    }
  }
}

function replayGraphChanges(
  changes: GraphChange[],
  ctx: {
    addNode: (n: TopoNode) => void;
    addEdge: (e: TopoEdge) => void;
    menuHandlers: MenuHandlers;
  }
): void {
  // Process in order: add nodes, add edges, delete edges, delete nodes
  const addNodes = changes.filter((c) => c.entity === "node" && c.kind === "add");
  const addEdges = changes.filter((c) => c.entity === "edge" && c.kind === "add");
  const deleteEdges = changes.filter((c) => c.entity === "edge" && c.kind === "delete");
  const deleteNodes = changes.filter((c) => c.entity === "node" && c.kind === "delete");

  [...addNodes, ...addEdges, ...deleteEdges, ...deleteNodes].forEach((change) => {
    processGraphChange(change, ctx);
  });
}

// ============================================================================
// Apply Callbacks Hook
// ============================================================================

function useApplyCallbacks(params: {
  addNode: (n: TopoNode) => void;
  addEdge: (e: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { addNode, addEdge, menuHandlers, edgeAnnotationHandlers, isApplyingUndoRedo } = params;

  const applyGraphChanges = React.useCallback(
    (changes: GraphChange[]) => {
      isApplyingUndoRedo.current = true;
      try {
        replayGraphChanges(changes, { addNode, addEdge, menuHandlers });
      } finally {
        isApplyingUndoRedo.current = false;
      }
    },
    [addNode, addEdge, menuHandlers, isApplyingUndoRedo]
  );

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

// ============================================================================
// Graph Mutation Handlers Hook
// ============================================================================

function useGraphMutationHandlers(params: {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  addNode: (n: TopoNode) => void;
  addEdge: (e: TopoEdge) => void;
  menuHandlers: MenuHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
  isApplyingUndoRedo: React.RefObject<boolean>;
}) {
  const { getNodes, getEdges, addNode, addEdge, menuHandlers, undoRedo, isApplyingUndoRedo } =
    params;

  // Edge creation handler
  const handleEdgeCreated = React.useCallback(
    (
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
    },
    [addEdge, undoRedo, isApplyingUndoRedo]
  );

  // Node creation handler
  const handleNodeCreatedCallback = React.useCallback(
    (nodeId: string, nodeElement: TopoNode, position: { x: number; y: number }) => {
      addNode(nodeElement);
      persistNewNode(nodeId, nodeElement, position);

      if (!isApplyingUndoRedo.current) {
        const nodeWithPosition: TopoNode = { ...nodeElement, position };
        undoRedo.pushAction({
          type: "graph",
          before: [{ entity: "node", kind: "delete", before: cloneNode(nodeWithPosition) }],
          after: [{ entity: "node", kind: "add", after: cloneNode(nodeWithPosition) }]
        });
      }
    },
    [addNode, undoRedo, isApplyingUndoRedo]
  );

  // Delete node handler with proper undo support
  const handleDeleteNodeWithUndo = React.useCallback(
    (nodeId: string) => {
      if (isApplyingUndoRedo.current) {
        menuHandlers.handleDeleteNode(nodeId);
        return;
      }

      const nodes = getNodes();
      const edges = getEdges();
      const node = nodes.find((n) => n.id === nodeId);

      if (!node) {
        log.warn(`[UndoRedo] Cannot delete node ${nodeId} - not found`);
        menuHandlers.handleDeleteNode(nodeId);
        return;
      }

      const connectedEdges = edges.filter((e) => e.source === nodeId || e.target === nodeId);
      const nodeElement = node as TopoNode;
      const edgeElements = connectedEdges.map((e) => e as TopoEdge);

      // Build undo action
      const beforeChanges: GraphChange[] = [
        { entity: "node", kind: "add", after: cloneNode(nodeElement) },
        ...edgeElements.map((e) => ({
          entity: "edge" as const,
          kind: "add" as const,
          after: cloneEdge(e)
        }))
      ];
      const afterChanges: GraphChange[] = [
        { entity: "node", kind: "delete", before: cloneNode(nodeElement) },
        ...edgeElements.map((e) => ({
          entity: "edge" as const,
          kind: "delete" as const,
          before: cloneEdge(e)
        }))
      ];

      undoRedo.pushAction({ type: "graph", before: beforeChanges, after: afterChanges });

      log.info(`[UndoRedo] Deleting node ${nodeId} with ${connectedEdges.length} connected edges`);
      menuHandlers.handleDeleteNode(nodeId);
      void deleteNode(nodeId);
    },
    [getNodes, getEdges, menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  // Delete edge handler with proper undo support
  const handleDeleteLinkWithUndo = React.useCallback(
    (edgeId: string) => {
      if (isApplyingUndoRedo.current) {
        menuHandlers.handleDeleteLink(edgeId);
        return;
      }

      const edges = getEdges();
      const edge = edges.find((e) => e.id === edgeId);

      if (!edge) {
        log.warn(`[UndoRedo] Cannot delete edge ${edgeId} - not found`);
        menuHandlers.handleDeleteLink(edgeId);
        return;
      }

      const edgeElement = edge as TopoEdge;

      undoRedo.pushAction({
        type: "graph",
        before: [{ entity: "edge", kind: "add", after: cloneEdge(edgeElement) }],
        after: [{ entity: "edge", kind: "delete", before: cloneEdge(edgeElement) }]
      });

      log.info(`[UndoRedo] Deleting edge ${edgeId}`);
      menuHandlers.handleDeleteLink(edgeId);

      const edgeData = edge.data as Record<string, unknown> | undefined;
      const linkData: LinkSaveData = {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        sourceEndpoint: (edgeData?.sourceEndpoint as string) || "",
        targetEndpoint: (edgeData?.targetEndpoint as string) || ""
      };
      void deleteLink(linkData);
    },
    [getEdges, menuHandlers, undoRedo, isApplyingUndoRedo]
  );

  // Property edit recording
  const recordPropertyEdit = React.useCallback(
    (action: Omit<UndoRedoActionPropertyEdit, "type">) => {
      if (isApplyingUndoRedo.current) return;
      undoRedo.pushAction({ type: "property-edit", ...action } as UndoRedoActionPropertyEdit);
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

// ============================================================================
// Exported Hooks
// ============================================================================

/**
 * Graph undo/redo handlers with internal state management.
 * Creates its own undo/redo state.
 */
export function useGraphUndoRedoHandlers(
  args: UseGraphUndoRedoHandlersParams
): GraphUndoRedoResult {
  const {
    mode,
    getNodes,
    getEdges,
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  } = args;
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
    getNodes,
    getEdges,
    addNode,
    addEdge,
    menuHandlers,
    undoRedo,
    isApplyingUndoRedo
  });

  return { undoRedo, ...handlers };
}

/**
 * Context-based variant that uses an external undoRedo instance.
 * Registers graph and property edit handlers with the context.
 */
export function useGraphHandlersWithContext(
  params: UseGraphUndoRedoWithContextParams
): GraphHandlersResult {
  const {
    getNodes,
    getEdges,
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
    getNodes,
    getEdges,
    addNode,
    addEdge,
    menuHandlers,
    undoRedo,
    isApplyingUndoRedo
  });
}
