/**
 * Editor handler hooks for node, link, and network editors.
 * Extracted from App.tsx to reduce file size.
 */
import React from "react";
import type { Core as CyCore, Core as CytoscapeCore, EdgeSingular } from "cytoscape";

import type {
  NodeEditorData,
  LinkEditorData,
  LinkImpairmentData,
  NetworkEditorData,
  FloatingActionPanelHandle
} from "../../components/panels";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { CustomIconInfo } from "../../../shared/types/icons";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import type { MembershipEntry } from "../state/useUndoRedo";
import { ROLE_SVG_MAP, type CytoscapeCanvasRef } from "../../components/canvas";
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
import { generateEncodedSVG, type NodeType } from "../../utils/SvgGenerator";
import { applyCustomIconStyles, DEFAULT_ICON_COLOR } from "../../utils/cytoscapeHelpers";

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
 * Update Cytoscape edge data after editor changes.
 * This ensures the edge's extraData reflects the saved values without requiring a reload.
 */
function updateCytoscapeEdgeData(
  cy: CytoscapeCore | null,
  edgeId: string,
  data: LinkEditorData
): void {
  if (!cy) return;

  const edge = cy.getElementById(edgeId);
  if (!edge || edge.empty()) return;

  edge.data("sourceEndpoint", data.sourceEndpoint);
  edge.data("targetEndpoint", data.targetEndpoint);

  // Build new extraData from editor data (same logic as convertEditorDataToLinkSaveData)
  const newExtraData: Record<string, unknown> = {};

  if (data.type && data.type !== "veth") {
    newExtraData.extType = data.type;
  }
  if (data.mtu !== undefined && data.mtu !== "") {
    newExtraData.extMtu = data.mtu;
  }
  if (data.sourceMac) {
    newExtraData.extSourceMac = data.sourceMac;
  }
  if (data.targetMac) {
    newExtraData.extTargetMac = data.targetMac;
  }
  if (data.vars && Object.keys(data.vars).length > 0) {
    newExtraData.extVars = data.vars;
  }
  if (data.labels && Object.keys(data.labels).length > 0) {
    newExtraData.extLabels = data.labels;
  }

  // Merge with existing extraData to preserve other properties
  const existingExtraData = (edge.data("extraData") as Record<string, unknown> | undefined) ?? {};
  edge.data("extraData", { ...existingExtraData, ...newExtraData });
}

/**
 * Update Cytoscape node data after editor changes.
 * Returns the new extraData that was set on the node, so callers can sync React state.
 * @param customIcons - Custom icons for checking if the icon is a custom icon
 */
function updateCytoscapeNodeData(
  cy: CytoscapeCore | null,
  nodeId: string,
  data: NodeEditorData,
  customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  if (!cy) return null;

  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return null;

  // Convert editor data to YAML format (kebab-case keys) and merge with existing
  const existingExtraData = (node.data("extraData") as Record<string, unknown> | undefined) ?? {};
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);

  const newExtraData: Record<string, unknown> = {
    ...existingExtraData,
    ...yamlExtraData
  };

  // Remove null values from the merged data - null signals "delete this property"
  // This ensures the property is completely absent, not present with null value
  for (const key of Object.keys(newExtraData)) {
    if (newExtraData[key] === null) {
      delete newExtraData[key];
    }
  }

  // Update the node data
  node.data("name", data.name);
  node.data("topoViewerRole", data.icon);
  node.data("iconColor", data.iconColor);
  node.data("iconCornerRadius", data.iconCornerRadius);
  node.data("extraData", newExtraData);

  // Update the background-image style to reflect the icon
  // Check for custom icon first
  const role = data.icon || "default";
  const customIcon = customIcons?.find((ci) => ci.name === role);
  if (customIcon) {
    applyCustomIconStyles(node, customIcon.dataUri, data.iconCornerRadius);
  } else {
    // Built-in icon with optional color
    const svgType = ROLE_SVG_MAP[role] as NodeType | undefined;
    if (svgType) {
      const color = data.iconColor || DEFAULT_ICON_COLOR;
      node.style("background-image", generateEncodedSVG(svgType, color));
    }
  }

  // Apply iconCornerRadius - requires round-rectangle shape
  if (data.iconCornerRadius !== undefined && data.iconCornerRadius > 0) {
    node.style("shape", "round-rectangle");
    node.style("corner-radius", data.iconCornerRadius);
  } else {
    // Reset to default rectangle shape when corner radius is 0 or undefined
    node.style("shape", "rectangle");
  }

  // Return the new extraData so callers can sync React state
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
  cyRef: React.RefObject<CytoscapeCanvasRef | null> | undefined,
  customIcons?: CustomIconInfo[]
): Record<string, unknown> | null {
  const cy = cyRef?.current?.getCy();

  if (oldName && renameNode) {
    // Update React state with the rename
    renameNode(oldName, data.name);
    // Also update Cytoscape directly so the canvas reflects the change immediately.
    // data.id is the OLD id, so we look up the node by old id and update its name.
    if (cy) {
      return updateCytoscapeNodeData(cy, data.id, data, customIcons);
    }
    return null;
  } else {
    if (cy) {
      return updateCytoscapeNodeData(cy, data.id, data, customIcons);
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
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>;
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
  const { cyRef, renameNode, customIcons, updateNodeData, refreshEditorData } = deps;
  const saveData = convertEditorDataToNodeSaveData(data, oldName);
  void editNodeService(saveData);
  const newExtraData = handleNodeUpdate(data, oldName, renameNode, cyRef, customIcons);
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
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>,
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
    () => ({ cyRef, renameNode, customIcons, updateNodeData, refreshEditorData }),
    [cyRef, renameNode, customIcons, updateNodeData, refreshEditorData]
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
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>;
  edgeAnnotationHandlers?: EdgeAnnotationHandlers;
}

/**
 * Persist link editor changes to the service and update canvas.
 * Shared by both Save and Apply operations.
 */
function persistLinkChanges(data: LinkEditorData, deps: LinkPersistDeps): void {
  const { cyRef, edgeAnnotationHandlers } = deps;
  const saveData = convertEditorDataToLinkSaveData(data);
  void editLinkService(saveData);
  persistEdgeLabelOffset(data, edgeAnnotationHandlers);
  // Update Cytoscape edge data so re-opening editor shows new values
  const cy = cyRef?.current?.getCy();
  if (cy) {
    updateCytoscapeEdgeData(cy, data.id, data);
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
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>,
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
    () => ({ cyRef, edgeAnnotationHandlers }),
    [cyRef, edgeAnnotationHandlers]
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
 * Update canvas elements when network node is renamed.
 */
function updateCanvasForRename(
  networkNode: ReturnType<CyCore["getElementById"]>,
  edge: EdgeSingular,
  oldId: string,
  newNodeId: string,
  newLabel: string
): void {
  networkNode.data("id", newNodeId);
  networkNode.data("name", newLabel);

  const edgeData = edge.data() as { source: string; target: string };
  if (edgeData.source === oldId) edge.data("source", newNodeId);
  if (edgeData.target === oldId) edge.data("target", newNodeId);
}

/**
 * Save network link properties to the YAML file.
 * Handles VXLAN properties (remote, vni, dst-port, src-port) and
 * host-interface property for host/mgmt-net/macvlan types.
 */
function saveNetworkLinkProperties(
  data: NetworkEditorData,
  newNodeId: string,
  cy: CyCore | null
): void {
  if (!cy || !isServicesInitialized()) return;
  if (!LINK_BASED_NETWORK_TYPES.has(data.networkType)) return;

  const oldId = data.id;
  const isRename = oldId !== newNodeId;

  const networkNode = cy.getElementById(oldId);
  if (networkNode.empty()) return;

  const connectedEdges = networkNode.connectedEdges();
  if (connectedEdges.empty()) return;

  const edge = connectedEdges.first();
  const edgeData = edge.data() as {
    id: string;
    source: string;
    target: string;
    sourceEndpoint?: string;
    targetEndpoint?: string;
  };
  const extraData = buildNetworkExtraData(data);

  // For YAML save: convert extMac to extSourceMac/extTargetMac based on which side is the real node
  const yamlExtraData = { ...extraData };
  if (yamlExtraData.extMac) {
    const networkIsSource = edgeData.source === oldId;
    if (networkIsSource) {
      yamlExtraData.extTargetMac = yamlExtraData.extMac;
    } else {
      yamlExtraData.extSourceMac = yamlExtraData.extMac;
    }
    delete yamlExtraData.extMac; // Remove generic extMac for YAML
  }

  const linkSaveData = {
    id: edgeData.id,
    source: edgeData.source === oldId ? newNodeId : edgeData.source,
    target: edgeData.target === oldId ? newNodeId : edgeData.target,
    sourceEndpoint: edgeData.sourceEndpoint,
    targetEndpoint: edgeData.targetEndpoint,
    extraData: yamlExtraData
  };

  void editLinkService(linkSaveData);

  if (isRename) {
    updateCanvasForRename(networkNode, edge, oldId, newNodeId, newNodeId);
  }

  // Update network node's extraData - keep extMac for editor to read
  // Filter out undefined values for cleaner data
  const cleanExtraData = Object.fromEntries(
    Object.entries(extraData).filter(([, v]) => v !== undefined)
  );
  networkNode.data("extraData", cleanExtraData);

  // Update edge's extraData with YAML format (extSourceMac/extTargetMac)
  const cleanYamlExtra = Object.fromEntries(
    Object.entries(yamlExtraData).filter(([, v]) => v !== undefined)
  );
  const existingEdgeExtra = (edge.data("extraData") as Record<string, unknown> | undefined) ?? {};
  edge.data("extraData", { ...existingEdgeExtra, ...cleanYamlExtra });
}

/**
 * Save bridge node changes to YAML and update canvas.
 * Handles renaming the YAML node key and updating link endpoints.
 */
function saveBridgeNodeProperties(
  data: NetworkEditorData,
  newNodeId: string,
  cy: CyCore | null,
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

  // Update graph state for renames (keeps label intact), fallback to Cytoscape-only updates when unavailable.
  if (isRename) {
    if (renameNode) {
      renameNode(oldId, newNodeId, data.label || newNodeId);
      return;
    }
    if (cy) {
      const bridgeNode = cy.getElementById(oldId);
      if (!bridgeNode.empty()) {
        // Update the node's displayed name
        bridgeNode.data("name", data.label || newNodeId);
        // Update connected edge references
        const connectedEdges = bridgeNode.connectedEdges();
        connectedEdges.forEach((edge) => {
          const edgeData = edge.data() as { source: string; target: string };
          if (edgeData.source === oldId) edge.data("source", newNodeId);
          if (edgeData.target === oldId) edge.data("target", newNodeId);
        });
      }
    }
    return;
  }
  if (cy) {
    // Even without rename, update the displayed name/label
    const bridgeNode = cy.getElementById(oldId);
    if (!bridgeNode.empty()) {
      bridgeNode.data("name", data.label || newNodeId);
    }
  }
}

/**
 * Hook for network editor handlers
 */
export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  _editingNetworkData: NetworkEditorData | null,
  cyInstance: CyCore | null,
  renameNode?: RenameNodeCallback
) {
  const handleClose = React.useCallback(() => {
    editNetwork(null);
  }, [editNetwork]);

  const handleSave = React.useCallback(
    (data: NetworkEditorData) => {
      const newNodeId = calculateExpectedNodeId(data);
      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId, cyInstance);
      saveBridgeNodeProperties(data, newNodeId, cyInstance, renameNode);
      editNetwork(null);
    },
    [editNetwork, cyInstance, renameNode]
  );

  const handleApply = React.useCallback(
    (data: NetworkEditorData) => {
      const newNodeId = calculateExpectedNodeId(data);
      saveNetworkAnnotation(data, newNodeId);
      saveNetworkLinkProperties(data, newNodeId, cyInstance);
      saveBridgeNodeProperties(data, newNodeId, cyInstance, renameNode);
    },
    [cyInstance, renameNode]
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
  cyInstance: CyCore | null,
  createNodeAtPosition: (position: Position, template?: CustomNodeTemplate) => void,
  onNewCustomNode: () => void
) {
  const handleAddNodeFromPanel = React.useCallback(
    (templateName?: string) => {
      if (templateName === "__new__") {
        onNewCustomNode();
        return;
      }

      if (!cyInstance) return;

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

      const extent = cyInstance.extent();
      const position: Position = {
        x: (extent.x1 + extent.x2) / 2,
        y: (extent.y1 + extent.y2) / 2
      };

      createNodeAtPosition(position, template);
    },
    [
      cyInstance,
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

// ============================================================================
// useLinkImpairmentHandlers
// ============================================================================

/**
 * Hook for link impairment handlers
 */
export function useLinkImpairmentHandlers(editImpairment: (id: string | null) => void) {
  const handleEditImpairment = React.useCallback(
    (edgeId: string) => {
      editImpairment(edgeId);
    },
    [editImpairment]
  );

  const handleClose = React.useCallback(() => {
    editImpairment(null);
  }, [editImpairment]);

  const handleSave = (data: LinkImpairmentData) => {
    console.log(data);
  };

  const handleApply = (data: LinkImpairmentData) => {
    console.log(data);
  };

  return {
    handleEditImpairment,
    handleClose,
    handleSave,
    handleApply
  };
}
