/**
 * Editor handler hooks for node, link, and network editors.
 * Extracted from App.tsx to reduce file size.
 */
import React from 'react';
import type { Core as CyCore, Core as CytoscapeCore, EdgeSingular } from 'cytoscape';

import type { NodeEditorData } from '../../components/panels/node-editor/types';
import type { LinkEditorData } from '../../components/panels/link-editor/types';
import type { NetworkEditorData } from '../../components/panels/network-editor';
import type { CustomNodeTemplate } from '../../../shared/types/editors';
import type { CustomIconInfo } from '../../../shared/types/icons';
import type { FloatingActionPanelHandle } from '../../components/panels/floatingPanel';
import type { MembershipEntry } from '../state/useUndoRedo';
import { ROLE_SVG_MAP, type CytoscapeCanvasRef } from '../../components/canvas';
import { convertEditorDataToNodeSaveData, convertEditorDataToYaml } from '../../../shared/utilities/nodeEditorConversions';
import { convertEditorDataToLinkSaveData } from '../../utils/linkEditorConversions';
import { editNode as editNodeService, editLink as editLinkService, isServicesInitialized, getAnnotationsIO, getTopologyIO } from '../../services';
import { generateEncodedSVG, type NodeType } from '../../utils/SvgGenerator';
import { applyCustomIconStyles, DEFAULT_ICON_COLOR } from '../../utils/cytoscapeHelpers';

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
  entityType: 'node' | 'link';
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  [key: string]: unknown;
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
type RenameNodeCallback = (oldId: string, newId: string) => void;

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

  // Build new extraData from editor data (same logic as convertEditorDataToLinkSaveData)
  const newExtraData: Record<string, unknown> = {};

  if (data.type && data.type !== 'veth') {
    newExtraData.extType = data.type;
  }
  if (data.mtu !== undefined && data.mtu !== '') {
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
  const existingExtraData = (edge.data('extraData') as Record<string, unknown> | undefined) ?? {};
  edge.data('extraData', { ...existingExtraData, ...newExtraData });
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
  const existingExtraData = (node.data('extraData') as Record<string, unknown> | undefined) ?? {};
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);

  const newExtraData: Record<string, unknown> = {
    ...existingExtraData,
    ...yamlExtraData,
  };

  // Remove null values from the merged data - null signals "delete this property"
  // This ensures the property is completely absent, not present with null value
  for (const key of Object.keys(newExtraData)) {
    if (newExtraData[key] === null) {
      delete newExtraData[key];
    }
  }

  // Update the node data
  node.data('name', data.name);
  node.data('topoViewerRole', data.icon);
  node.data('iconColor', data.iconColor);
  node.data('iconCornerRadius', data.iconCornerRadius);
  node.data('extraData', newExtraData);

  // Update the background-image style to reflect the icon
  // Check for custom icon first
  const role = data.icon || 'default';
  const customIcon = customIcons?.find(ci => ci.name === role);
  if (customIcon) {
    applyCustomIconStyles(node, customIcon.dataUri, data.iconCornerRadius);
  } else {
    // Built-in icon with optional color
    const svgType = ROLE_SVG_MAP[role] as NodeType | undefined;
    if (svgType) {
      const color = data.iconColor || DEFAULT_ICON_COLOR;
      node.style('background-image', generateEncodedSVG(svgType, color));
    }
  }

  // Apply iconCornerRadius - requires round-rectangle shape
  if (data.iconCornerRadius !== undefined && data.iconCornerRadius > 0) {
    node.style('shape', 'round-rectangle');
    node.style('corner-radius', data.iconCornerRadius);
  } else {
    // Reset to default rectangle shape when corner radius is 0 or undefined
    node.style('shape', 'rectangle');
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
  if (oldName && renameNode) {
    renameNode(oldName, data.name);
    return null;
  } else {
    const cy = cyRef?.current?.getCy();
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
  entityType: 'node' | 'link',
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
  if (updateNodeData && newExtraData) {
    updateNodeData(data.id, newExtraData);
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

  const handleSave = React.useCallback((data: NodeEditorData) => {
    // Only record if there are actual changes (checkChanges = true)
    recordEdit('node', initialDataRef.current, data, recordPropertyEdit, true);
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    persistNodeChanges(data, oldName, persistDeps);
    initialDataRef.current = null;
    editNode(null);
  }, [editNode, recordPropertyEdit, persistDeps]);

  const handleApply = React.useCallback((data: NodeEditorData) => {
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    const changed = recordEdit('node', initialDataRef.current, data, recordPropertyEdit, true);
    if (changed) {
      initialDataRef.current = { ...data };
    }
    persistNodeChanges(data, oldName, persistDeps);
  }, [recordPropertyEdit, persistDeps]);

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useLinkEditorHandlers
// ============================================================================

/**
 * Hook for link editor handlers with undo/redo support
 */
export function useLinkEditorHandlers(
  editEdge: (id: string | null) => void,
  editingLinkData: LinkEditorData | null,
  recordPropertyEdit?: (action: PropertyEditAction) => void,
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>
) {
  const initialDataRef = React.useRef<LinkEditorData | null>(null);

  React.useEffect(() => {
    if (editingLinkData) {
      initialDataRef.current = { ...editingLinkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingLinkData?.id]);

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge]);

  const handleSave = React.useCallback((data: LinkEditorData) => {
    // Only record if there are actual changes (checkChanges = true)
    recordEdit('link', initialDataRef.current, data, recordPropertyEdit, true);
    const saveData = convertEditorDataToLinkSaveData(data);
    void editLinkService(saveData);
    // Update Cytoscape edge data so re-opening editor shows new values
    const cy = cyRef?.current?.getCy();
    if (cy) {
      updateCytoscapeEdgeData(cy, data.id, data);
    }
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge, recordPropertyEdit, cyRef]);

  const handleApply = React.useCallback((data: LinkEditorData) => {
    const changed = recordEdit('link', initialDataRef.current, data, recordPropertyEdit, true);
    if (changed) {
      initialDataRef.current = { ...data };
    }
    const saveData = convertEditorDataToLinkSaveData(data);
    void editLinkService(saveData);
    // Update Cytoscape edge data so re-opening editor shows new values
    const cy = cyRef?.current?.getCy();
    if (cy) {
      updateCytoscapeEdgeData(cy, data.id, data);
    }
  }, [recordPropertyEdit, cyRef]);

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useNetworkEditorHandlers
// ============================================================================

/** VXLAN types that need link property updates */
const VXLAN_NETWORK_TYPES = new Set(['vxlan', 'vxlan-stitch']);

/** Host-like types that have host-interface property */
const HOST_INTERFACE_TYPES = new Set(['host', 'mgmt-net', 'macvlan']);

/** Network types that are stored as link types (not YAML nodes) */
const LINK_BASED_NETWORK_TYPES = new Set(['host', 'mgmt-net', 'macvlan', 'vxlan', 'vxlan-stitch', 'dummy']);

/**
 * Calculate the expected node ID based on network type and interface.
 * For host/mgmt-net/macvlan, the ID is `type:interface` (e.g., `host:eth0`, `macvlan:100`).
 */
function calculateExpectedNodeId(data: NetworkEditorData): string {
  if (data.networkType === 'host') {
    return `host:${data.interfaceName || 'eth0'}`;
  }
  if (data.networkType === 'mgmt-net') {
    return `mgmt-net:${data.interfaceName || 'net0'}`;
  }
  if (data.networkType === 'macvlan') {
    return `macvlan:${data.interfaceName || 'eth1'}`;
  }
  // For other types, the ID doesn't change based on interface
  return data.id;
}

/**
 * Save network annotation label to the annotations file.
 * Also handles rename if interface changed (which changes the node ID).
 * When renamed, the label is automatically set to the new node ID.
 */
function saveNetworkAnnotation(data: NetworkEditorData, newNodeId: string): void {
  if (!isServicesInitialized()) return;

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();
  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) return;

  const oldId = data.id;
  const isRename = oldId !== newNodeId;
  // When renamed, always use the new ID as label for consistency
  const newLabel = isRename ? newNodeId : data.label;

  void annotationsIO.modifyAnnotations(yamlPath, annotations => {
    if (!annotations.nodeAnnotations) annotations.nodeAnnotations = [];

    // Update nodeAnnotations
    const existing = annotations.nodeAnnotations.find(n => n.id === oldId);
    if (existing) {
      if (isRename) existing.id = newNodeId;
      existing.label = newLabel;
    } else if (!isRename) {
      annotations.nodeAnnotations.push({ id: data.id, label: newLabel });
    }

    // Also update networkNodeAnnotations if present
    if (isRename && annotations.networkNodeAnnotations) {
      const networkAnn = annotations.networkNodeAnnotations.find(n => n.id === oldId);
      if (networkAnn) {
        networkAnn.id = newNodeId;
        networkAnn.label = newLabel;
      }
    }

    return annotations;
  });
}

/** Convert string to number or undefined */
const toNumOrUndef = (val: string | undefined): number | undefined => val ? Number(val) : undefined;

/** Get non-empty string or undefined */
const strOrUndef = (val: string | undefined): string | undefined => val || undefined;

/** Get non-empty record or undefined */
const recordOrUndef = (val: Record<string, string> | undefined): Record<string, string> | undefined =>
  (val && Object.keys(val).length > 0) ? val : undefined;

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
      extSrcPort: toNumOrUndef(data.vxlanSrcPort),
    });
  } else if (HOST_INTERFACE_TYPES.has(data.networkType)) {
    extraData.extHostInterface = strOrUndef(data.interfaceName);
    extraData.extMode = (data.networkType === 'macvlan') ? strOrUndef(data.macvlanMode) : undefined;
  }

  // Common properties
  Object.assign(extraData, {
    extMtu: toNumOrUndef(data.mtu),
    extMac: strOrUndef(data.mac),
    extVars: recordOrUndef(data.vars),
    extLabels: recordOrUndef(data.labels),
  });

  return extraData;
}

/**
 * Update canvas elements when network node is renamed.
 */
function updateCanvasForRename(
  networkNode: ReturnType<CyCore['getElementById']>,
  edge: EdgeSingular,
  oldId: string,
  newNodeId: string,
  newLabel: string
): void {
  networkNode.data('id', newNodeId);
  networkNode.data('name', newLabel);

  const edgeData = edge.data() as { source: string; target: string };
  if (edgeData.source === oldId) edge.data('source', newNodeId);
  if (edgeData.target === oldId) edge.data('target', newNodeId);
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
  const edgeData = edge.data() as { id: string; source: string; target: string; sourceEndpoint?: string; targetEndpoint?: string };
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
    extraData: yamlExtraData,
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
  networkNode.data('extraData', cleanExtraData);

  // Update edge's extraData with YAML format (extSourceMac/extTargetMac)
  const cleanYamlExtra = Object.fromEntries(
    Object.entries(yamlExtraData).filter(([, v]) => v !== undefined)
  );
  const existingEdgeExtra = (edge.data('extraData') as Record<string, unknown> | undefined) ?? {};
  edge.data('extraData', { ...existingEdgeExtra, ...cleanYamlExtra });
}

/**
 * Hook for network editor handlers
 */
export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  _editingNetworkData: NetworkEditorData | null,
  cyInstance: CyCore | null
) {
  const handleClose = React.useCallback(() => {
    editNetwork(null);
  }, [editNetwork]);

  const handleSave = React.useCallback((data: NetworkEditorData) => {
    const newNodeId = calculateExpectedNodeId(data);
    saveNetworkAnnotation(data, newNodeId);
    saveNetworkLinkProperties(data, newNodeId, cyInstance);
    editNetwork(null);
  }, [editNetwork, cyInstance]);

  const handleApply = React.useCallback((data: NetworkEditorData) => {
    const newNodeId = calculateExpectedNodeId(data);
    saveNetworkAnnotation(data, newNodeId);
    saveNetworkLinkProperties(data, newNodeId, cyInstance);
  }, [cyInstance]);

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
  const handleAddNodeFromPanel = React.useCallback((templateName?: string) => {
    if (templateName === '__new__') {
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
      template = state.customNodes.find(n => n.name === templateName);
    } else if (state.defaultNode) {
      template = state.customNodes.find(n => n.name === state.defaultNode);
    }

    const extent = cyInstance.extent();
    const position: Position = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };

    createNodeAtPosition(position, template);
  }, [cyInstance, state.isLocked, state.customNodes, state.defaultNode, createNodeAtPosition, floatingPanelRef, onNewCustomNode]);

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
  const applyMembershipChange = React.useCallback((memberships: MembershipEntry[]) => {
    for (const entry of memberships) {
      if (entry.groupId) {
        groups.addNodeToGroup(entry.nodeId, entry.groupId);
      } else {
        groups.removeNodeFromGroup(entry.nodeId);
      }
    }
  }, [groups]);

  const onMembershipWillChange = React.useCallback((nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
    pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
  }, [pendingMembershipChangesRef]);

  return { applyMembershipChange, onMembershipWillChange };
}
