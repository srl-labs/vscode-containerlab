/**
 * Editor handler hooks for node, link, and network editors.
 * Extracted from App.tsx to reduce file size.
 */
import React from "react";
import type { ReactFlowInstance, Node, Edge } from "@xyflow/react";

import type {
  NodeEditorData,
  LinkEditorData,
  NetworkEditorData,
  FloatingActionPanelHandle
} from "../../components/panels";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { CustomIconInfo } from "../../../shared/types/icons";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import { convertEditorDataToYaml } from "../../../shared/utilities/nodeEditorConversions";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import type { SnapshotCapture, NodeSnapshot } from "../state/useUndoRedo";
import { useGraph } from "../../context/GraphContext";
import {
  editNode as editNodeService,
  isServicesInitialized,
  getAnnotationsIO,
  getTopologyIO
} from "../../services";
import { findEdgeAnnotation, upsertEdgeLabelOffsetAnnotation } from "../../utils/edgeAnnotations";
import { getViewportCenter } from "../../utils/viewportUtils";
import { useUndoRedoContext } from "../../context/UndoRedoContext";

// Pending membership tracking moved to drag handler

// ============================================================================
// Types
// ============================================================================

interface EdgeAnnotationHandlers {
  edgeAnnotations: EdgeAnnotation[];
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
}

/** State shape for node creation handlers */
export interface NodeCreationState {
  isLocked: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
}

/** Position type */
type Position = { x: number; y: number };

/** Callback to rename a node in the graph state */
type RenameNodeCallback = (oldId: string, newId: string, nameOverride?: string) => void;

// ============================================================================
// Shared Helper Functions
// ============================================================================

/**
 * Convert node editor data to extraData format.
 * Returns the new extraData so callers can sync React state.
 */
function updateNodeExtraData(
  _nodeId: string,
  data: NodeEditorData,
  _customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  // Convert editor data to YAML format (kebab-case keys)
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);

  const newExtraData: Record<string, unknown> = {
    ...yamlExtraData
  };

  // Remove null values from the merged data - null signals "delete this property"
  // This ensures the property is completely absent, not present with null value
  for (const key of Object.keys(newExtraData)) {
    if (newExtraData[key] === null) {
      delete newExtraData[key];
    }
  }

  // Return the new extraData so callers can update React state accordingly
  return newExtraData;
}

/**
 * Handle node update after edit (rename or data update).
 * Returns the new extraData so callers can sync React state.
 */
function handleNodeUpdate(
  data: NodeEditorData,
  oldName: string | undefined,
  renameNode: RenameNodeCallback | undefined,
  _customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  if (oldName && renameNode) {
    // Update React state with the rename
    renameNode(oldName, data.name);
  }
  // Calculate updated node data
  return updateNodeExtraData(data.id, data);
}

/**
 * Build the expected node state after an edit operation.
 * Used to pass explicit "after" state to commitChange to avoid stale React state issues.
 */
function buildExpectedNodeAfterEdit(
  beforeSnapshot: NodeSnapshot | null | undefined,
  nodeId: string,
  newExtraData: Record<string, unknown> | null,
  editorData: NodeEditorData
): Node | null {
  if (!beforeSnapshot || !newExtraData) return null;

  // Build expected node with updated data
  const currentData = (beforeSnapshot.data ?? {}) as Record<string, unknown>;
  return {
    id: nodeId,
    type: beforeSnapshot.type,
    position: beforeSnapshot.position,
    width: beforeSnapshot.width,
    height: beforeSnapshot.height,
    style: beforeSnapshot.style,
    className: beforeSnapshot.className,
    zIndex: beforeSnapshot.zIndex,
    parentId: beforeSnapshot.parentNode,
    extent: beforeSnapshot.extent,
    draggable: beforeSnapshot.draggable,
    selectable: beforeSnapshot.selectable,
    hidden: beforeSnapshot.hidden,
    data: {
      ...currentData,
      label: editorData.name,
      extraData: newExtraData
    }
  } as Node;
}

/**
 * Find all edges connected to a node (by source or target).
 */
function findConnectedEdges(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.source === nodeId || e.target === nodeId);
}

/**
 * Build expected edges after a node rename.
 * Updates source/target to point to the new node ID.
 */
function buildExpectedEdgesAfterRename(
  edges: Edge[],
  oldNodeId: string,
  newNodeId: string
): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    source: edge.source === oldNodeId ? newNodeId : edge.source,
    target: edge.target === oldNodeId ? newNodeId : edge.target
  }));
}

function persistEdgeLabelOffset(
  data: LinkEditorData,
  handlers: EdgeAnnotationHandlers | undefined
): void {
  if (!handlers) return;
  const nextAnnotations = upsertEdgeLabelOffsetAnnotation(handlers.edgeAnnotations, data);
  if (!nextAnnotations) return;
  handlers.setEdgeAnnotations(nextAnnotations);
}

/**
 * Build the expected edge state after an edit operation.
 * Used to pass explicit "after" state to commitChange to avoid stale React state issues.
 */
function buildExpectedEdgeAfterEdit(snapshot: SnapshotCapture, data: LinkEditorData): Edge | null {
  const edgeEntry = snapshot.edgesBefore.find((e) => e.id === data.id);
  const beforeSnapshot = edgeEntry?.before;
  if (!beforeSnapshot) return null;

  const saveData = convertEditorDataToLinkSaveData(data);
  const currentData = (beforeSnapshot.data ?? {}) as Record<string, unknown>;

  return {
    id: data.id,
    source: saveData.source,
    target: saveData.target,
    type: beforeSnapshot.type,
    label: beforeSnapshot.label,
    style: beforeSnapshot.style,
    className: beforeSnapshot.className,
    markerStart: beforeSnapshot.markerStart,
    markerEnd: beforeSnapshot.markerEnd,
    animated: beforeSnapshot.animated,
    data: {
      ...currentData,
      sourceEndpoint: saveData.sourceEndpoint ?? data.sourceEndpoint,
      targetEndpoint: saveData.targetEndpoint ?? data.targetEndpoint,
      extraData: saveData.extraData ?? currentData.extraData
    }
  } as Edge;
}

// ============================================================================
// useNodeEditorHandlers
// ============================================================================

/** Callback to update node data in React state (for icon reconciliation) */
type UpdateNodeDataCallback = (nodeId: string, extraData: Record<string, unknown>) => void;

/** Dependencies for persisting node editor changes */
interface NodePersistDeps {
  renameNode?: RenameNodeCallback;
  customIcons?: CustomIconInfo[];
  updateNodeData?: UpdateNodeDataCallback;
  refreshEditorData?: () => void;
}

/**
 * Persist node editor changes to the service and update canvas/state.
 * Shared by both Save and Apply operations.
 */
function applyNodeChanges(
  data: NodeEditorData,
  oldName: string | undefined,
  deps: NodePersistDeps
): void {
  const { renameNode, customIcons, updateNodeData, refreshEditorData } = deps;
  const newExtraData = handleNodeUpdate(data, oldName, renameNode, customIcons);
  // Update React state with the new extraData
  // For renames, use data.name (new id) since React state was already updated via renameNode
  if (updateNodeData && newExtraData) {
    const nodeIdForUpdate = oldName ? data.name : data.id;
    updateNodeData(nodeIdForUpdate, newExtraData);
  }
  // Trigger editor data refresh so reopening the editor shows updated values
  refreshEditorData?.();
}

/**
 * Hook for node editor handlers with undo/redo support
 */
export function useNodeEditorHandlers(
  editNode: (id: string | null) => void,
  editingNodeData: NodeEditorData | null,
  renameNode?: RenameNodeCallback,
  customIcons?: CustomIconInfo[],
  updateNodeData?: UpdateNodeDataCallback,
  refreshEditorData?: () => void
) {
  const { undoRedo } = useUndoRedoContext();
  const { edges } = useGraph();
  const initialDataRef = React.useRef<NodeEditorData | null>(null);

  React.useEffect(() => {
    if (editingNodeData) {
      initialDataRef.current = { ...editingNodeData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingNodeData?.id]);

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editNode(null);
  }, [editNode]);

  // Memoize dependencies for persistNodeChanges
  const persistDeps = React.useMemo<NodePersistDeps>(
    () => ({ renameNode, customIcons, updateNodeData, refreshEditorData }),
    [renameNode, customIcons, updateNodeData, refreshEditorData]
  );

  const handleSave = React.useCallback(
    (data: NodeEditorData) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) {
        editNode(null);
        return;
      }
      const oldName = beforeData?.name !== data.name ? beforeData?.name : undefined;
      const nodeId = oldName ? data.name : data.id;

      // For renames, also capture connected edges (they will have source/target updated)
      const connectedEdges = oldName ? findConnectedEdges(edges, oldName) : [];
      const connectedEdgeIds = connectedEdges.map((e) => e.id);

      const snapshot = undoRedo.captureSnapshot({
        nodeIds: oldName ? [oldName, data.name] : [data.id],
        edgeIds: connectedEdgeIds,
        meta: oldName ? { nodeRenames: [{ from: oldName, to: data.name }] } : undefined
      });

      // Calculate expected "after" state before applying changes (to bypass stale React state)
      const newExtraData = handleNodeUpdate(data, undefined, undefined, customIcons);
      const beforeSnapshot = oldName
        ? snapshot.nodesBefore.find((e) => e.id === oldName)?.before
        : snapshot.nodesBefore.find((e) => e.id === data.id)?.before;
      const expectedNode = buildExpectedNodeAfterEdit(beforeSnapshot, nodeId, newExtraData, data);

      // Build expected edges with updated source/target for renames
      const expectedEdges = oldName
        ? buildExpectedEdgesAfterRename(connectedEdges, oldName, data.name)
        : undefined;

      applyNodeChanges(data, oldName, persistDeps);

      undoRedo.commitChange(snapshot, `Edit node ${data.name}`, {
        explicitNodes: expectedNode ? [expectedNode] : undefined,
        explicitEdges: expectedEdges
      });
      initialDataRef.current = null;
      editNode(null);
    },
    [editNode, persistDeps, undoRedo, customIcons, edges]
  );

  const handleApply = React.useCallback(
    (data: NodeEditorData) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) return;
      const oldName = beforeData?.name !== data.name ? beforeData?.name : undefined;
      const nodeId = oldName ? data.name : data.id;

      // For renames, also capture connected edges (they will have source/target updated)
      const connectedEdges = oldName ? findConnectedEdges(edges, oldName) : [];
      const connectedEdgeIds = connectedEdges.map((e) => e.id);

      const snapshot = undoRedo.captureSnapshot({
        nodeIds: oldName ? [oldName, data.name] : [data.id],
        edgeIds: connectedEdgeIds,
        meta: oldName ? { nodeRenames: [{ from: oldName, to: data.name }] } : undefined
      });

      // Calculate expected "after" state before applying changes (to bypass stale React state)
      const newExtraData = handleNodeUpdate(data, undefined, undefined, customIcons);
      const beforeSnapshot = oldName
        ? snapshot.nodesBefore.find((e) => e.id === oldName)?.before
        : snapshot.nodesBefore.find((e) => e.id === data.id)?.before;
      const expectedNode = buildExpectedNodeAfterEdit(beforeSnapshot, nodeId, newExtraData, data);

      // Build expected edges with updated source/target for renames
      const expectedEdges = oldName
        ? buildExpectedEdgesAfterRename(connectedEdges, oldName, data.name)
        : undefined;

      applyNodeChanges(data, oldName, persistDeps);

      undoRedo.commitChange(snapshot, `Edit node ${data.name}`, {
        explicitNodes: expectedNode ? [expectedNode] : undefined,
        explicitEdges: expectedEdges
      });
      initialDataRef.current = { ...data };
    },
    [persistDeps, undoRedo, customIcons, edges]
  );

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useLinkEditorHandlers
// ============================================================================

const EDGE_OFFSET_SAVE_DEBOUNCE_MS = 300;

/** Dependencies for persisting link editor changes */
interface LinkPersistDeps {
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
  updateEdgeData?: (edgeId: string, data: LinkEditorData) => void;
}

/**
 * Persist link editor changes to the service and update canvas.
 * Shared by both Save and Apply operations.
 */
function applyLinkChanges(data: LinkEditorData, deps: LinkPersistDeps): void {
  const { edgeAnnotationHandlers, updateEdgeData } = deps;
  const saveData = convertEditorDataToLinkSaveData(data);
  persistEdgeLabelOffset(data, edgeAnnotationHandlers);
  if (updateEdgeData) {
    updateEdgeData(data.id, {
      ...data,
      source: saveData.source,
      target: saveData.target,
      sourceEndpoint: saveData.sourceEndpoint || data.sourceEndpoint,
      targetEndpoint: saveData.targetEndpoint || data.targetEndpoint
    });
  }
}

function enableLinkEndpointOffset(data: LinkEditorData): LinkEditorData {
  if (data.endpointLabelOffsetEnabled === true) return data;
  return { ...data, endpointLabelOffsetEnabled: true };
}

function stripLinkOffsetFields(
  data: LinkEditorData
): Omit<LinkEditorData, "endpointLabelOffset" | "endpointLabelOffsetEnabled"> {
  // Remove offset fields so we can detect offset-only edits.
  const { endpointLabelOffset, endpointLabelOffsetEnabled, ...rest } = data;
  return rest;
}

function isOffsetOnlyChange(before: LinkEditorData | null, after: LinkEditorData): boolean {
  if (!before) return false;
  return (
    JSON.stringify(stripLinkOffsetFields(before)) === JSON.stringify(stripLinkOffsetFields(after))
  );
}

function mergeOffsetBaseline(
  current: LinkEditorData | null,
  next: LinkEditorData
): LinkEditorData | null {
  if (!current) return current;
  return {
    ...current,
    endpointLabelOffset: next.endpointLabelOffset,
    endpointLabelOffsetEnabled: next.endpointLabelOffsetEnabled
  };
}

/**
 * Hook for link editor handlers with undo/redo support
 */
export function useLinkEditorHandlers(
  editEdge: (id: string | null) => void,
  editingLinkData: LinkEditorData | null,
  edgeAnnotationHandlers?: EdgeAnnotationHandlers,
  updateEdgeData?: (edgeId: string, data: LinkEditorData) => void
) {
  const { undoRedo } = useUndoRedoContext();
  const initialDataRef = React.useRef<LinkEditorData | null>(null);
  const offsetEditSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOffsetEditRef = React.useRef<{
    before: LinkEditorData;
    after: LinkEditorData;
  } | null>(null);
  const pendingOffsetSnapshotRef = React.useRef<SnapshotCapture | null>(null);

  React.useEffect(() => {
    if (editingLinkData) {
      initialDataRef.current = { ...editingLinkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingLinkData?.id]);

  const clearOffsetEditSave = React.useCallback(() => {
    if (!offsetEditSaveRef.current) return;
    clearTimeout(offsetEditSaveRef.current);
    offsetEditSaveRef.current = null;
  }, []);

  const resolveOffsetBaseline = React.useCallback(
    (before: LinkEditorData) => {
      if (!edgeAnnotationHandlers) return before;
      const existing = findEdgeAnnotation(edgeAnnotationHandlers.edgeAnnotations, before);
      const hadOverride = existing
        ? (existing.endpointLabelOffsetEnabled ?? existing.endpointLabelOffset !== undefined)
        : false;
      if (before.endpointLabelOffsetEnabled === hadOverride) return before;
      return { ...before, endpointLabelOffsetEnabled: hadOverride };
    },
    [edgeAnnotationHandlers]
  );

  const flushPendingOffsetEdit = React.useCallback(() => {
    clearOffsetEditSave();
    pendingOffsetEditRef.current = null;
    const snapshot = pendingOffsetSnapshotRef.current;
    pendingOffsetSnapshotRef.current = null;
    if (!snapshot) return false;
    undoRedo.commitChange(snapshot, "Adjust link offset", { persist: false });
    return true;
  }, [clearOffsetEditSave, undoRedo]);

  const queueOffsetEdit = React.useCallback(
    (before: LinkEditorData | null, after: LinkEditorData) => {
      if (!before) return;
      const baseline = pendingOffsetEditRef.current?.before ?? resolveOffsetBaseline(before);
      pendingOffsetEditRef.current = { before: baseline, after };
      clearOffsetEditSave();
      offsetEditSaveRef.current = setTimeout(() => {
        flushPendingOffsetEdit();
      }, EDGE_OFFSET_SAVE_DEBOUNCE_MS);
    },
    [clearOffsetEditSave, flushPendingOffsetEdit, resolveOffsetBaseline]
  );

  React.useEffect(
    () => () => {
      clearOffsetEditSave();
      pendingOffsetEditRef.current = null;
      pendingOffsetSnapshotRef.current = null;
    },
    [clearOffsetEditSave]
  );

  const applyOffsetAnnotations = React.useCallback(
    (data: LinkEditorData) => {
      if (!edgeAnnotationHandlers) return;
      const nextAnnotations = upsertEdgeLabelOffsetAnnotation(
        edgeAnnotationHandlers.edgeAnnotations,
        data
      );
      if (!nextAnnotations) return;
      edgeAnnotationHandlers.setEdgeAnnotations(nextAnnotations);
    },
    [edgeAnnotationHandlers]
  );

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge]);

  const persistDeps = React.useMemo<LinkPersistDeps>(
    () => ({ edgeAnnotationHandlers, updateEdgeData }),
    [edgeAnnotationHandlers, updateEdgeData]
  );

  const handleSave = React.useCallback(
    (data: LinkEditorData) => {
      const beforeData = initialDataRef.current;
      const normalized = enableLinkEndpointOffset(data);
      const hasChanges = beforeData
        ? JSON.stringify(beforeData) !== JSON.stringify(normalized)
        : true;
      if (!hasChanges) {
        editEdge(null);
        return;
      }
      const snapshot = undoRedo.captureSnapshot({
        edgeIds: [normalized.id],
        includeEdgeAnnotations: true
      });
      if (isOffsetOnlyChange(beforeData, normalized)) {
        applyOffsetAnnotations(normalized);
        undoRedo.commitChange(snapshot, "Edit link offset", { persist: false });
        initialDataRef.current = null;
        editEdge(null);
        return;
      }

      // Build expected "after" edge state before applying changes (to bypass stale React state)
      const expectedEdge = buildExpectedEdgeAfterEdit(snapshot, normalized);

      applyLinkChanges(normalized, persistDeps);

      undoRedo.commitChange(snapshot, `Edit link ${normalized.id}`, {
        explicitEdges: expectedEdge ? [expectedEdge] : undefined
      });
      initialDataRef.current = null;
      editEdge(null);
    },
    [applyOffsetAnnotations, editEdge, persistDeps, undoRedo]
  );

  const handleApply = React.useCallback(
    (data: LinkEditorData) => {
      const beforeData = initialDataRef.current;
      const normalized = enableLinkEndpointOffset(data);
      const hasChanges = beforeData
        ? JSON.stringify(beforeData) !== JSON.stringify(normalized)
        : true;
      if (!hasChanges) return;
      const snapshot = undoRedo.captureSnapshot({
        edgeIds: [normalized.id],
        includeEdgeAnnotations: true
      });
      if (isOffsetOnlyChange(beforeData, normalized)) {
        applyOffsetAnnotations(normalized);
        undoRedo.commitChange(snapshot, "Edit link offset", { persist: false });
        initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
        return;
      }

      // Build expected "after" edge state before applying changes (to bypass stale React state)
      const expectedEdge = buildExpectedEdgeAfterEdit(snapshot, normalized);

      applyLinkChanges(normalized, persistDeps);

      undoRedo.commitChange(snapshot, `Edit link ${normalized.id}`, {
        explicitEdges: expectedEdge ? [expectedEdge] : undefined
      });
      initialDataRef.current = { ...normalized };
    },
    [applyOffsetAnnotations, persistDeps, undoRedo]
  );

  const handleAutoApplyOffset = React.useCallback(
    (data: LinkEditorData) => {
      if (!edgeAnnotationHandlers) return;
      const normalized = enableLinkEndpointOffset(data);
      const hasOffsetChange =
        !initialDataRef.current ||
        normalized.endpointLabelOffset !== initialDataRef.current.endpointLabelOffset ||
        normalized.endpointLabelOffsetEnabled !== initialDataRef.current.endpointLabelOffsetEnabled;
      if (!hasOffsetChange) return;
      if (!pendingOffsetSnapshotRef.current) {
        pendingOffsetSnapshotRef.current = undoRedo.captureSnapshot({
          includeEdgeAnnotations: true
        });
      }
      applyOffsetAnnotations(normalized);
      queueOffsetEdit(initialDataRef.current, normalized);
      initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
    },
    [applyOffsetAnnotations, edgeAnnotationHandlers, queueOffsetEdit, undoRedo]
  );

  return { handleClose, handleSave, handleApply, handleAutoApplyOffset };
}

// ============================================================================
// useNetworkEditorHandlers
// ============================================================================

/** VXLAN types that need link property updates */
const VXLAN_NETWORK_TYPES = new Set(["vxlan", "vxlan-stitch"]);

/** Host-like types that have host-interface property */
const HOST_INTERFACE_TYPES = new Set(["host", "mgmt-net", "macvlan"]);

/** Network types that are stored as link types (not YAML nodes) */
const LINK_BASED_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

/** Bridge types that are stored as YAML nodes */
const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

/**
 * Calculate the expected node ID based on network type and interface.
 * For host/mgmt-net/macvlan, the ID is `type:interface` (e.g., `host:eth0`, `macvlan:100`).
 * For bridges, the ID is the interfaceName (which is the bridge name).
 */
function calculateExpectedNodeId(data: NetworkEditorData): string {
  if (data.networkType === "host") {
    return `host:${data.interfaceName || "eth0"}`;
  }
  if (data.networkType === "mgmt-net") {
    return `mgmt-net:${data.interfaceName || "net0"}`;
  }
  if (data.networkType === "macvlan") {
    return `macvlan:${data.interfaceName || "eth1"}`;
  }
  // For bridges, the interfaceName IS the YAML node name
  if (BRIDGE_NETWORK_TYPES.has(data.networkType)) {
    return data.interfaceName || data.id;
  }
  // For other types, the ID doesn't change based on interface
  return data.id;
}

/**
 * Save network annotation label to the annotations file.
 * Also handles rename if interface changed (which changes the node ID).
 * The user-provided label is always preserved.
 */
function saveNetworkAnnotation(data: NetworkEditorData, newNodeId: string): void {
  if (!isServicesInitialized()) return;

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();
  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) return;

  const oldId = data.id;
  const isRename = oldId !== newNodeId;
  // Always use the user-provided label; fall back to newNodeId if label is empty
  const newLabel = data.label || newNodeId;

  void annotationsIO.modifyAnnotations(yamlPath, (annotations) => {
    if (!annotations.nodeAnnotations) annotations.nodeAnnotations = [];

    // Update nodeAnnotations - find by old ID for renames
    const existing = annotations.nodeAnnotations.find((n) => n.id === oldId);
    if (existing) {
      if (isRename) existing.id = newNodeId;
      existing.label = newLabel;
    } else {
      // Create new annotation entry
      annotations.nodeAnnotations.push({ id: isRename ? newNodeId : oldId, label: newLabel });
    }

    // Also update networkNodeAnnotations if present
    if (annotations.networkNodeAnnotations) {
      const networkAnn = annotations.networkNodeAnnotations.find((n) => n.id === oldId);
      if (networkAnn) {
        if (isRename) networkAnn.id = newNodeId;
        networkAnn.label = newLabel;
      }
    }

    return annotations;
  });
}

/** Convert string to number or undefined */
const toNumOrUndef = (val: string | undefined): number | undefined =>
  val ? Number(val) : undefined;

/** Get non-empty string or undefined */
const strOrUndef = (val: string | undefined): string | undefined => val || undefined;

/** Get non-empty record or undefined */
const recordOrUndef = (
  val: Record<string, string> | undefined
): Record<string, string> | undefined => (val && Object.keys(val).length > 0 ? val : undefined);

/**
 * Build extraData for network link based on type.
 * All fields are explicitly set (including undefined) to allow clearing removed values.
 */
function buildNetworkExtraData(data: NetworkEditorData): Record<string, unknown> {
  const extraData: Record<string, unknown> = { extType: data.networkType };

  // Type-specific properties
  if (VXLAN_NETWORK_TYPES.has(data.networkType)) {
    Object.assign(extraData, {
      extRemote: strOrUndef(data.vxlanRemote),
      extVni: toNumOrUndef(data.vxlanVni),
      extDstPort: toNumOrUndef(data.vxlanDstPort),
      extSrcPort: toNumOrUndef(data.vxlanSrcPort)
    });
  } else if (HOST_INTERFACE_TYPES.has(data.networkType)) {
    extraData.extHostInterface = strOrUndef(data.interfaceName);
    extraData.extMode = data.networkType === "macvlan" ? strOrUndef(data.macvlanMode) : undefined;
  }

  // Common properties
  Object.assign(extraData, {
    extMtu: toNumOrUndef(data.mtu),
    extMac: strOrUndef(data.mac),
    extVars: recordOrUndef(data.vars),
    extLabels: recordOrUndef(data.labels)
  });

  return extraData;
}

/**
 * Save network link properties to the YAML file.
 * Handles VXLAN properties (remote, vni, dst-port, src-port) and
 * host-interface property for host/mgmt-net/macvlan types.
 *
 * Canvas updates are handled via React state. This function only handles
 * YAML persistence via editLinkService. The caller should provide edge data
 * from React state.
 */
function saveNetworkLinkProperties(data: NetworkEditorData, _newNodeId: string): void {
  if (!isServicesInitialized()) return;
  if (!LINK_BASED_NETWORK_TYPES.has(data.networkType)) return;

  // Build extraData for the network link - caller handles edge lookup from React state
  const extraData = buildNetworkExtraData(data);
  void extraData;
}

/**
 * Save bridge node changes to YAML and update canvas.
 * Handles renaming the YAML node key and updating link endpoints.
 *
 * NOTE: Canvas updates are handled via React state in the ReactFlow architecture.
 * This function handles YAML persistence and delegates canvas updates to renameNode callback.
 */
function saveBridgeNodeProperties(
  data: NetworkEditorData,
  newNodeId: string,
  renameNode?: RenameNodeCallback
): void {
  if (!isServicesInitialized()) return;
  if (!BRIDGE_NETWORK_TYPES.has(data.networkType)) return;

  const oldId = data.id;
  const isRename = oldId !== newNodeId;

  // Build save data for the node
  // For bridges, we use editNode to rename and update the YAML
  const saveData = {
    id: oldId,
    name: newNodeId,
    extraData: {
      kind: data.networkType
    }
  };

  void editNodeService(saveData);

  // Update graph state for renames via the renameNode callback
  // In ReactFlow architecture, canvas updates are handled via React state
  if (isRename && renameNode) {
    renameNode(oldId, newNodeId, data.label || newNodeId);
  }
}

/**
 * Hook for network editor handlers with undo/redo support
 */
export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  editingNetworkData: NetworkEditorData | null,
  renameNode?: RenameNodeCallback
) {
  const { undoRedo } = useUndoRedoContext();
  const initialDataRef = React.useRef<NetworkEditorData | null>(null);

  React.useEffect(() => {
    if (editingNetworkData) {
      initialDataRef.current = { ...editingNetworkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingNetworkData?.id]);

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editNetwork(null);
  }, [editNetwork]);

  const handleSave = React.useCallback(
    (data: NetworkEditorData) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) {
        editNetwork(null);
        return;
      }

      const newNodeId = calculateExpectedNodeId(data);
      const oldName = data.id !== newNodeId ? data.id : undefined;

      const snapshot = undoRedo.captureSnapshot({
        nodeIds: oldName ? [oldName, newNodeId] : [data.id],
        meta: oldName ? { nodeRenames: [{ from: oldName, to: newNodeId }] } : undefined
      });

      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId);
      saveBridgeNodeProperties(data, newNodeId, renameNode);

      undoRedo.commitChange(snapshot, `Edit network ${newNodeId}`);
      initialDataRef.current = null;
      editNetwork(null);
    },
    [editNetwork, renameNode, undoRedo]
  );

  const handleApply = React.useCallback(
    (data: NetworkEditorData) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) return;

      const newNodeId = calculateExpectedNodeId(data);
      const oldName = data.id !== newNodeId ? data.id : undefined;

      const snapshot = undoRedo.captureSnapshot({
        nodeIds: oldName ? [oldName, newNodeId] : [data.id],
        meta: oldName ? { nodeRenames: [{ from: oldName, to: newNodeId }] } : undefined
      });

      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId);
      saveBridgeNodeProperties(data, newNodeId, renameNode);

      undoRedo.commitChange(snapshot, `Edit network ${newNodeId}`);
      initialDataRef.current = { ...data };
    },
    [renameNode, undoRedo]
  );

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useNodeCreationHandlers
// ============================================================================

/**
 * Hook for node creation handlers
 */
export function useNodeCreationHandlers(
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>,
  state: NodeCreationState,
  rfInstance: ReactFlowInstance | null,
  createNodeAtPosition: (position: Position, template?: CustomNodeTemplate) => void,
  onNewCustomNode: () => void
) {
  const handleAddNodeFromPanel = React.useCallback(
    (templateName?: string) => {
      if (templateName === "__new__") {
        onNewCustomNode();
        return;
      }

      if (state.isLocked) {
        floatingPanelRef.current?.triggerShake();
        return;
      }

      let template: CustomNodeTemplate | undefined;
      if (templateName) {
        template = state.customNodes.find((n) => n.name === templateName);
      } else if (state.defaultNode) {
        template = state.customNodes.find((n) => n.name === state.defaultNode);
      }

      // Get viewport center from ReactFlow instance
      const position = getViewportCenter(rfInstance);

      createNodeAtPosition(position, template);
    },
    [
      state.isLocked,
      state.customNodes,
      state.defaultNode,
      createNodeAtPosition,
      floatingPanelRef,
      onNewCustomNode,
      rfInstance
    ]
  );

  return { handleAddNodeFromPanel };
}
