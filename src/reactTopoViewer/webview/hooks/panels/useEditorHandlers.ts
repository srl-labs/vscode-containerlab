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
import type { FloatingActionPanelHandle } from '../../components/panels/floatingPanel';
import type { MembershipEntry } from '../state/useUndoRedo';
import type { CytoscapeCanvasRef } from '../../components/canvas';
import { convertEditorDataToNodeSaveData, convertEditorDataToYaml } from '../../../shared/utilities/nodeEditorConversions';
import { convertEditorDataToLinkSaveData } from '../../utils/linkEditorConversions';
import { editNode as editNodeService, editLink as editLinkService, isServicesInitialized, getAnnotationsIO, getTopologyIO } from '../../services';

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
 */
function updateCytoscapeNodeData(
  cy: CytoscapeCore | null,
  nodeId: string,
  data: NodeEditorData
): void {
  if (!cy) return;

  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  // Convert editor data to YAML format (kebab-case keys) and merge with existing
  const existingExtraData = node.data('extraData') || {};
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);
  const newExtraData = {
    ...existingExtraData,
    ...yamlExtraData,
  };

  // Update the node data
  node.data('name', data.name);
  node.data('topoViewerRole', data.icon);
  node.data('iconColor', data.iconColor);
  node.data('iconCornerRadius', data.iconCornerRadius);
  node.data('extraData', newExtraData);
}

/**
 * Handle node update after edit (rename or data update)
 */
function handleNodeUpdate(
  data: NodeEditorData,
  oldName: string | undefined,
  renameNode: RenameNodeCallback | undefined,
  cyRef: React.RefObject<CytoscapeCanvasRef | null> | undefined
): void {
  if (oldName && renameNode) {
    renameNode(oldName, data.name);
  } else {
    const cy = cyRef?.current?.getCy();
    if (cy) {
      updateCytoscapeNodeData(cy, data.id, data);
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

/**
 * Hook for node editor handlers with undo/redo support
 */
export function useNodeEditorHandlers(
  editNode: (id: string | null) => void,
  editingNodeData: NodeEditorData | null,
  recordPropertyEdit?: (action: PropertyEditAction) => void,
  cyRef?: React.RefObject<CytoscapeCanvasRef | null>,
  renameNode?: RenameNodeCallback
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
    recordEdit('node', initialDataRef.current, data, recordPropertyEdit);
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    const saveData = convertEditorDataToNodeSaveData(data, oldName);
    void editNodeService(saveData);
    handleNodeUpdate(data, oldName, renameNode, cyRef);
    initialDataRef.current = null;
    editNode(null);
  }, [editNode, recordPropertyEdit, cyRef, renameNode]);

  const handleApply = React.useCallback((data: NodeEditorData) => {
    const oldName = initialDataRef.current?.name !== data.name ? initialDataRef.current?.name : undefined;
    const changed = recordEdit('node', initialDataRef.current, data, recordPropertyEdit, true);
    if (changed) {
      initialDataRef.current = { ...data };
    }
    const saveData = convertEditorDataToNodeSaveData(data, oldName);
    void editNodeService(saveData);
    handleNodeUpdate(data, oldName, renameNode, cyRef);
  }, [recordPropertyEdit, cyRef, renameNode]);

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
    recordEdit('link', initialDataRef.current, data, recordPropertyEdit);
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
