/**
 * Editor handler hooks for node, link, and network editors.
 * Extracted from App.tsx to reduce file size.
 */
import React from "react";

import type {
  NodeEditorData,
  LinkEditorData,
  NetworkEditorData,
  FloatingActionPanelHandle
} from "../../components/panels";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { CustomIconInfo } from "../../../shared/types/icons";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import type { MembershipEntry } from "../state/useUndoRedo";
import {
  convertEditorDataToNodeSaveData,
  convertEditorDataToYaml
} from "../../../shared/utilities/nodeEditorConversions";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import {
  editNode as editNodeService,
  editLink as editLinkService,
  saveEdgeAnnotations,
  isServicesInitialized,
  getAnnotationsIO,
  getTopologyIO
} from "../../services";
import { findEdgeAnnotation, upsertEdgeLabelOffsetAnnotation } from "../../utils/edgeAnnotations";

/** Pending membership change during node drag */
export interface PendingMembershipChange {
  nodeId: string;
  oldGroupId: string | null;
  newGroupId: string | null;
}

// ============================================================================
// Types
// ============================================================================

/** Property edit action for undo/redo (matches UndoRedoActionPropertyEdit without 'type') */
interface PropertyEditAction {
  entityType: "node" | "link";
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  [key: string]: unknown;
}

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
 * Update edge data after editor changes.
 * This ensures the edge's extraData reflects the saved values without requiring a reload.
 */
/**
 * Update edge data after editor changes.
 *
 * NOTE: This function is a migration stub. In the ReactFlow architecture,
 * edge updates are handled via React state. The unknown interface
 * is read-only, so direct mutation is not supported. The actual data
 * persistence is handled by the editLinkService call.
 */
function updateCytoscapeEdgeData(_cyCompat: null, _edgeId: string, _data: LinkEditorData): void {
  // In the ReactFlow architecture, edge data updates are handled via React state.
  // The editLinkService call in persistLinkChanges handles the actual persistence.
  // This function is kept as a stub for API compatibility during migration.
}

/**
 * Update node data after editor changes.
 * Returns the new extraData that was set on the node, so callers can sync React state.
 * @param customIcons - Custom icons for checking if the icon is a custom icon
 *
 * NOTE: This function is a migration stub. In the ReactFlow architecture,
 * node data updates are handled through React state, not direct mutation.
 */
function updateCytoscapeNodeData(
  _cyCompat: null,
  _nodeId: string,
  data: NodeEditorData,
  _customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  // NOTE: During ReactFlow migration, node data is obtained from React state.
  // This function now just converts editor data to YAML format without
  // accessing any Cytoscape-like methods.

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
  cyCompat: null | undefined,
  _customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  if (oldName && renameNode) {
    // Update React state with the rename
    renameNode(oldName, data.name);
    // Also update via compat layer for data calculation
    if (cyCompat) {
      return updateCytoscapeNodeData(cyCompat, data.id, data);
    }
    return null;
  } else {
    if (cyCompat) {
      return updateCytoscapeNodeData(cyCompat, data.id, data);
    }
    return null;
  }
}

/**
 * Record property edit for undo/redo if needed
 */
function recordEdit<T extends { id: string }>(
  entityType: "node" | "link",
  current: T | null,
  newData: T,
  recordPropertyEdit: ((action: PropertyEditAction) => void) | undefined,
  checkChanges = false
): boolean {
  if (!recordPropertyEdit || !current) return true;

  if (checkChanges) {
    const hasChanges = JSON.stringify(current) !== JSON.stringify(newData);
    if (!hasChanges) return false;
  }

  recordPropertyEdit({
    entityType,
    entityId: current.id,
    before: current as unknown as Record<string, unknown>,
    after: newData as unknown as Record<string, unknown>
  });
  return true;
}

function persistEdgeLabelOffset(
  data: LinkEditorData,
  handlers: EdgeAnnotationHandlers | undefined
): void {
  if (!handlers) return;
  const nextAnnotations = upsertEdgeLabelOffsetAnnotation(handlers.edgeAnnotations, data);
  if (!nextAnnotations) return;
  handlers.setEdgeAnnotations(nextAnnotations);
  void saveEdgeAnnotations(nextAnnotations);
}

// ============================================================================
// useNodeEditorHandlers
// ============================================================================

/** Callback to update node data in React state (for icon reconciliation) */
type UpdateNodeDataCallback = (nodeId: string, extraData: Record<string, unknown>) => void;

/** Dependencies for persisting node editor changes */
interface NodePersistDeps {
  cyCompat?: null;
  renameNode?: RenameNodeCallback;
  customIcons?: CustomIconInfo[];
  updateNodeData?: UpdateNodeDataCallback;
  refreshEditorData?: () => void;
}

/**
 * Persist node editor changes to the service and update canvas/state.
 * Shared by both Save and Apply operations.
 */
function persistNodeChanges(
  data: NodeEditorData,
  oldName: string | undefined,
  deps: NodePersistDeps
): void {
  const { cyCompat, renameNode, customIcons, updateNodeData, refreshEditorData } = deps;
  const saveData = convertEditorDataToNodeSaveData(data, oldName);
  void editNodeService(saveData);
  const newExtraData = handleNodeUpdate(data, oldName, renameNode, cyCompat, customIcons);
  // Update React state with the SAME extraData that was set on Cytoscape
  // This prevents useElementsUpdate from overwriting Cytoscape with stale React state
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
  recordPropertyEdit?: (action: PropertyEditAction) => void,
  cyCompat?: null,
  renameNode?: RenameNodeCallback,
  customIcons?: CustomIconInfo[],
  updateNodeData?: UpdateNodeDataCallback,
  refreshEditorData?: () => void
) {
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
    () => ({ cyCompat, renameNode, customIcons, updateNodeData, refreshEditorData }),
    [cyCompat, renameNode, customIcons, updateNodeData, refreshEditorData]
  );

  const handleSave = React.useCallback(
    (data: NodeEditorData) => {
      // Only record if there are actual changes (checkChanges = true)
      recordEdit("node", initialDataRef.current, data, recordPropertyEdit, true);
      const oldName =
        initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
      persistNodeChanges(data, oldName, persistDeps);
      initialDataRef.current = null;
      editNode(null);
    },
    [editNode, recordPropertyEdit, persistDeps]
  );

  const handleApply = React.useCallback(
    (data: NodeEditorData) => {
      const oldName =
        initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
      const changed = recordEdit("node", initialDataRef.current, data, recordPropertyEdit, true);
      if (changed) {
        initialDataRef.current = { ...data };
      }
      persistNodeChanges(data, oldName, persistDeps);
    },
    [recordPropertyEdit, persistDeps]
  );

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useLinkEditorHandlers
// ============================================================================

const EDGE_OFFSET_SAVE_DEBOUNCE_MS = 300;

/** Dependencies for persisting link editor changes */
interface LinkPersistDeps {
  cyCompat?: null;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
}

/**
 * Persist link editor changes to the service and update canvas.
 * Shared by both Save and Apply operations.
 */
function persistLinkChanges(data: LinkEditorData, deps: LinkPersistDeps): void {
  const { cyCompat, edgeAnnotationHandlers } = deps;
  const saveData = convertEditorDataToLinkSaveData(data);
  void editLinkService(saveData);
  persistEdgeLabelOffset(data, edgeAnnotationHandlers);
  // Update edge data via compat layer (currently a stub in ReactFlow architecture)
  if (cyCompat) {
    updateCytoscapeEdgeData(cyCompat, data.id, data);
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
  recordPropertyEdit?: (action: PropertyEditAction) => void,
  cyCompat?: null,
  edgeAnnotationHandlers?: EdgeAnnotationHandlers
) {
  const initialDataRef = React.useRef<LinkEditorData | null>(null);
  const edgeAnnotationSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEdgeAnnotationsRef = React.useRef<EdgeAnnotation[] | null>(null);
  const offsetEditSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOffsetEditRef = React.useRef<{
    before: LinkEditorData;
    after: LinkEditorData;
  } | null>(null);

  React.useEffect(() => {
    if (editingLinkData) {
      initialDataRef.current = { ...editingLinkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingLinkData?.id]);

  const clearEdgeAnnotationSave = React.useCallback(() => {
    if (!edgeAnnotationSaveRef.current) return;
    clearTimeout(edgeAnnotationSaveRef.current);
    edgeAnnotationSaveRef.current = null;
  }, []);

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
    const pending = pendingOffsetEditRef.current;
    pendingOffsetEditRef.current = null;
    if (!pending) return false;
    recordEdit("link", pending.before, pending.after, recordPropertyEdit, true);
    return true;
  }, [clearOffsetEditSave, recordPropertyEdit]);

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

  const saveEdgeAnnotationsImmediate = React.useCallback(
    (annotations: EdgeAnnotation[]) => {
      clearEdgeAnnotationSave();
      pendingEdgeAnnotationsRef.current = null;
      void saveEdgeAnnotations(annotations);
    },
    [clearEdgeAnnotationSave]
  );

  const saveEdgeAnnotationsDebounced = React.useCallback(
    (annotations: EdgeAnnotation[]) => {
      pendingEdgeAnnotationsRef.current = annotations;
      clearEdgeAnnotationSave();
      edgeAnnotationSaveRef.current = setTimeout(() => {
        const pending = pendingEdgeAnnotationsRef.current;
        pendingEdgeAnnotationsRef.current = null;
        edgeAnnotationSaveRef.current = null;
        if (!pending) return;
        void saveEdgeAnnotations(pending);
      }, EDGE_OFFSET_SAVE_DEBOUNCE_MS);
    },
    [clearEdgeAnnotationSave]
  );

  React.useEffect(
    () => () => {
      clearEdgeAnnotationSave();
      pendingEdgeAnnotationsRef.current = null;
      clearOffsetEditSave();
      pendingOffsetEditRef.current = null;
    },
    [clearEdgeAnnotationSave, clearOffsetEditSave]
  );

  const applyOffsetAnnotations = React.useCallback(
    (data: LinkEditorData, saveAnnotations: (annotations: EdgeAnnotation[]) => void) => {
      if (!edgeAnnotationHandlers) return;
      const nextAnnotations = upsertEdgeLabelOffsetAnnotation(
        edgeAnnotationHandlers.edgeAnnotations,
        data
      );
      if (!nextAnnotations) return;
      edgeAnnotationHandlers.setEdgeAnnotations(nextAnnotations);
      saveAnnotations(nextAnnotations);
    },
    [edgeAnnotationHandlers]
  );

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge]);

  // Memoize dependencies for persistLinkChanges
  const persistDeps = React.useMemo<LinkPersistDeps>(
    () => ({ cyCompat, edgeAnnotationHandlers }),
    [cyCompat, edgeAnnotationHandlers]
  );

  const handleSave = React.useCallback(
    (data: LinkEditorData) => {
      clearEdgeAnnotationSave();
      const offsetFlushed = flushPendingOffsetEdit();
      const normalized = enableLinkEndpointOffset(data);
      if (isOffsetOnlyChange(initialDataRef.current, normalized)) {
        if (!offsetFlushed) {
          recordEdit("link", initialDataRef.current, normalized, recordPropertyEdit, true);
        }
        applyOffsetAnnotations(normalized, saveEdgeAnnotationsImmediate);
        initialDataRef.current = null;
        editEdge(null);
        return;
      }
      // Only record if there are actual changes (checkChanges = true)
      recordEdit("link", initialDataRef.current, normalized, recordPropertyEdit, true);
      persistLinkChanges(normalized, persistDeps);
      initialDataRef.current = null;
      editEdge(null);
    },
    [
      applyOffsetAnnotations,
      clearEdgeAnnotationSave,
      editEdge,
      flushPendingOffsetEdit,
      recordPropertyEdit,
      saveEdgeAnnotationsImmediate,
      persistDeps
    ]
  );

  const handleApply = React.useCallback(
    (data: LinkEditorData) => {
      clearEdgeAnnotationSave();
      const offsetFlushed = flushPendingOffsetEdit();
      const normalized = enableLinkEndpointOffset(data);
      if (isOffsetOnlyChange(initialDataRef.current, normalized)) {
        if (!offsetFlushed) {
          const changed = recordEdit(
            "link",
            initialDataRef.current,
            normalized,
            recordPropertyEdit,
            true
          );
          if (changed) {
            initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
          }
        }
        applyOffsetAnnotations(normalized, saveEdgeAnnotationsImmediate);
        return;
      }
      const changed = recordEdit(
        "link",
        initialDataRef.current,
        normalized,
        recordPropertyEdit,
        true
      );
      if (changed) {
        initialDataRef.current = { ...normalized };
      }
      persistLinkChanges(normalized, persistDeps);
    },
    [
      applyOffsetAnnotations,
      clearEdgeAnnotationSave,
      flushPendingOffsetEdit,
      recordPropertyEdit,
      saveEdgeAnnotationsImmediate,
      persistDeps
    ]
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
      applyOffsetAnnotations(normalized, saveEdgeAnnotationsDebounced);
      queueOffsetEdit(initialDataRef.current, normalized);
      initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
    },
    [applyOffsetAnnotations, edgeAnnotationHandlers, queueOffsetEdit, saveEdgeAnnotationsDebounced]
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
 * NOTE: Canvas updates are handled via React state in the ReactFlow architecture.
 * This function only handles the YAML persistence via editLinkService.
 * NOTE: This function is disabled during ReactFlow migration as edge data is
 * obtained from React state, not a Cytoscape-like layer.
 */
function saveNetworkLinkProperties(
  data: NetworkEditorData,
  _newNodeId: string,
  _cyCompat: null
): void {
  if (!isServicesInitialized()) return;
  if (!LINK_BASED_NETWORK_TYPES.has(data.networkType)) return;

  // NOTE: During ReactFlow migration, edge data should be obtained from React state.
  // This function is a stub that only saves the extraData.
  // The actual edge lookup should be done by the caller using React state.

  const extraData = buildNetworkExtraData(data);

  // For now, just log that we would save these properties
  void extraData;

  // NOTE: Full implementation requires edge data from React state, not cyCompat
  // The caller should pass edge data directly or look it up from React state
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
  _cyCompat: null,
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
 * Hook for network editor handlers
 */
export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  _editingNetworkData: NetworkEditorData | null,
  cyCompat: null,
  renameNode?: RenameNodeCallback
) {
  const handleClose = React.useCallback(() => {
    editNetwork(null);
  }, [editNetwork]);

  const handleSave = React.useCallback(
    (data: NetworkEditorData) => {
      const newNodeId = calculateExpectedNodeId(data);
      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId, cyCompat);
      saveBridgeNodeProperties(data, newNodeId, cyCompat, renameNode);
      editNetwork(null);
    },
    [editNetwork, cyCompat, renameNode]
  );

  const handleApply = React.useCallback(
    (data: NetworkEditorData) => {
      const newNodeId = calculateExpectedNodeId(data);
      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId, cyCompat);
      saveBridgeNodeProperties(data, newNodeId, cyCompat, renameNode);
    },
    [cyCompat, renameNode]
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
  _cyCompat: null,
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

      // NOTE: During ReactFlow migration, viewport center is obtained from ReactFlow.
      // This stub uses a default position. The caller should pass the center from
      // ReactFlow's useReactFlow().getViewport() or similar.
      const position: Position = { x: 0, y: 0 };

      createNodeAtPosition(position, template);
    },
    [
      state.isLocked,
      state.customNodes,
      state.defaultNode,
      createNodeAtPosition,
      floatingPanelRef,
      onNewCustomNode
    ]
  );

  return { handleAddNodeFromPanel };
}

// ============================================================================
// useMembershipCallbacks
// ============================================================================

interface GroupsApi {
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
}

/**
 * Hook for membership change callbacks (reduces App complexity)
 */
export function useMembershipCallbacks(
  groups: GroupsApi,
  pendingMembershipChangesRef: React.RefObject<Map<string, PendingMembershipChange>>
) {
  const applyMembershipChange = React.useCallback(
    (memberships: MembershipEntry[]) => {
      for (const entry of memberships) {
        if (entry.groupId) {
          groups.addNodeToGroup(entry.nodeId, entry.groupId);
        } else {
          groups.removeNodeFromGroup(entry.nodeId);
        }
      }
    },
    [groups]
  );

  const onMembershipWillChange = React.useCallback(
    (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
      pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
    },
    [pendingMembershipChangesRef]
  );

  return { applyMembershipChange, onMembershipWillChange };
}
