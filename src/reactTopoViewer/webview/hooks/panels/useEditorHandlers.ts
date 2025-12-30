/**
 * Editor handler hooks for node, link, and network editors.
 * Extracted from App.tsx to reduce file size.
 */
import React from 'react';
import type { Core as CyCore, Core as CytoscapeCore } from 'cytoscape';

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
 * Update Cytoscape node data after editor changes
 * @param customIcons - Custom icons for checking if the icon is a custom icon
 */
function updateCytoscapeNodeData(
  cy: CytoscapeCore | null,
  nodeId: string,
  data: NodeEditorData,
  customIcons?: CustomIconInfo[]
): void {
  if (!cy) return;

  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  // Convert editor data to YAML format (kebab-case keys) and merge with existing
  const existingExtraData = (node.data('extraData') as Record<string, unknown> | undefined) ?? {};
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);
  const newExtraData: Record<string, unknown> = {
    ...existingExtraData,
    ...yamlExtraData,
  };

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
}

/**
 * Handle node update after edit (rename or data update)
 */
function handleNodeUpdate(
  data: NodeEditorData,
  oldName: string | undefined,
  renameNode: RenameNodeCallback | undefined,
  cyRef: React.RefObject<CytoscapeCanvasRef | null> | undefined,
  customIcons?: CustomIconInfo[]
): void {
  if (oldName && renameNode) {
    renameNode(oldName, data.name);
  } else {
    const cy = cyRef?.current?.getCy();
    if (cy) {
      updateCytoscapeNodeData(cy, data.id, data, customIcons);
    }
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
  updateNodeData?: UpdateNodeDataCallback
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

  const handleSave = React.useCallback((data: NodeEditorData) => {
    // Only record if there are actual changes (checkChanges = true)
    recordEdit('node', initialDataRef.current, data, recordPropertyEdit, true);
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    const saveData = convertEditorDataToNodeSaveData(data, oldName);
    void editNodeService(saveData);
    handleNodeUpdate(data, oldName, renameNode, cyRef, customIcons);
    // Update React state for icon reconciliation
    if (updateNodeData) {
      updateNodeData(data.id, { topoViewerRole: data.icon, iconColor: data.iconColor, iconCornerRadius: data.iconCornerRadius });
    }
    initialDataRef.current = null;
    editNode(null);
  }, [editNode, recordPropertyEdit, cyRef, renameNode, customIcons, updateNodeData]);

  const handleApply = React.useCallback((data: NodeEditorData) => {
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    const changed = recordEdit('node', initialDataRef.current, data, recordPropertyEdit, true);
    if (changed) {
      initialDataRef.current = { ...data };
    }
    const saveData = convertEditorDataToNodeSaveData(data, oldName);
    void editNodeService(saveData);
    handleNodeUpdate(data, oldName, renameNode, cyRef, customIcons);
    // Update React state for icon reconciliation
    if (updateNodeData) {
      updateNodeData(data.id, { topoViewerRole: data.icon, iconColor: data.iconColor, iconCornerRadius: data.iconCornerRadius });
    }
  }, [recordPropertyEdit, cyRef, renameNode, customIcons, updateNodeData]);

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
  recordPropertyEdit?: (action: PropertyEditAction) => void
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
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge, recordPropertyEdit]);

  const handleApply = React.useCallback((data: LinkEditorData) => {
    const changed = recordEdit('link', initialDataRef.current, data, recordPropertyEdit, true);
    if (changed) {
      initialDataRef.current = { ...data };
    }
    const saveData = convertEditorDataToLinkSaveData(data);
    void editLinkService(saveData);
  }, [recordPropertyEdit]);

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useNetworkEditorHandlers
// ============================================================================

/**
 * Save network annotation label to the annotations file
 */
function saveNetworkAnnotation(data: NetworkEditorData): void {
  if (!isServicesInitialized()) return;

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();
  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) return;

  void annotationsIO.modifyAnnotations(yamlPath, annotations => {
    if (!annotations.nodeAnnotations) annotations.nodeAnnotations = [];
    const existing = annotations.nodeAnnotations.find(n => n.id === data.id);
    if (existing) {
      existing.label = data.label;
    } else {
      annotations.nodeAnnotations.push({ id: data.id, label: data.label });
    }
    return annotations;
  });
}

/**
 * Hook for network editor handlers
 */
export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  _editingNetworkData: NetworkEditorData | null
) {
  const handleClose = React.useCallback(() => {
    editNetwork(null);
  }, [editNetwork]);

  const handleSave = React.useCallback((data: NetworkEditorData) => {
    saveNetworkAnnotation(data);
    editNetwork(null);
  }, [editNetwork]);

  const handleApply = React.useCallback((data: NetworkEditorData) => {
    saveNetworkAnnotation(data);
  }, []);

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
