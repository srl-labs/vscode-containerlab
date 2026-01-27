/**
 * Editor handler hooks for node, link, and network editors.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { EdgeAnnotation } from "../../../shared/types/topology";
import {
  convertEditorDataToYaml,
  convertEditorDataToNodeSaveData,
  convertNetworkEditorDataToYaml
} from "../../../shared/utilities";
import type { FloatingActionPanelHandle } from "../../components/panels/floatingPanel/FloatingActionPanel";
import type { LinkEditorData } from "../../components/panels/link-editor/types";
import type { NetworkEditorData } from "../../components/panels/network-editor/types";
import type { NodeEditorData } from "../../components/panels/node-editor/types";
import {
  executeTopologyCommand,
  executeTopologyCommands,
  saveEdgeAnnotations,
  saveNetworkNodesFromGraph
} from "../../services";
import { useGraphState, useGraphStore } from "../../stores/graphStore";
import {
  findEdgeAnnotation,
  upsertEdgeLabelOffsetAnnotation
} from "../../annotations/edgeAnnotations";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import { BRIDGE_NETWORK_TYPES } from "../../utils/networkNodeTypes";
import { getViewportCenter } from "../../utils/viewportUtils";

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

/** Callback to update node extraData in graph state */
type UpdateNodeDataCallback = (nodeId: string, extraData: Record<string, unknown>) => void;

// ============================================================================
// Shared Helper Functions
// ============================================================================

function updateNodeExtraData(data: NodeEditorData): Record<string, unknown> {
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);
  const newExtraData: Record<string, unknown> = { ...yamlExtraData };
  for (const key of Object.keys(newExtraData)) {
    if (newExtraData[key] === null) {
      delete newExtraData[key];
    }
  }
  return newExtraData;
}

function applyNodeChanges(
  data: NodeEditorData,
  oldName: string | undefined,
  deps: {
    renameNode?: RenameNodeCallback;
    updateNodeData?: UpdateNodeDataCallback;
    refreshEditorData?: () => void;
  }
): void {
  const { renameNode, updateNodeData, refreshEditorData } = deps;
  if (oldName && renameNode) {
    renameNode(oldName, data.name, data.name);
  }

  if (updateNodeData) {
    const nodeIdForUpdate = oldName ? data.name : data.id;
    updateNodeData(nodeIdForUpdate, updateNodeExtraData(data));
  }

  refreshEditorData?.();
}

// ============================================================================
// useNodeEditorHandlers
// ============================================================================

export function useNodeEditorHandlers(
  editNode: (id: string | null) => void,
  editingNodeData: NodeEditorData | null,
  renameNode?: RenameNodeCallback,
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

  const persistDeps = React.useMemo(
    () => ({ renameNode, updateNodeData, refreshEditorData }),
    [renameNode, updateNodeData, refreshEditorData]
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
      applyNodeChanges(data, oldName, persistDeps);

      const saveData = convertEditorDataToNodeSaveData(data, oldName);
      void executeTopologyCommand({ command: "editNode", payload: saveData });

      initialDataRef.current = null;
      editNode(null);
    },
    [editNode, persistDeps]
  );

  const handleApply = React.useCallback(
    (data: NodeEditorData) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) return;

      const oldName = beforeData?.name !== data.name ? beforeData?.name : undefined;
      applyNodeChanges(data, oldName, persistDeps);

      const saveData = convertEditorDataToNodeSaveData(data, oldName);
      void executeTopologyCommand({ command: "editNode", payload: saveData });

      initialDataRef.current = { ...data };
    },
    [persistDeps]
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

function enableLinkEndpointOffset(data: LinkEditorData): LinkEditorData {
  if (data.endpointLabelOffsetEnabled === true) return data;
  return { ...data, endpointLabelOffsetEnabled: true };
}

function stripLinkOffsetFields(
  data: LinkEditorData
): Omit<LinkEditorData, "endpointLabelOffset" | "endpointLabelOffsetEnabled"> {
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

function applyLinkChanges(data: LinkEditorData, deps: LinkPersistDeps): void {
  const { updateEdgeData } = deps;
  const saveData = convertEditorDataToLinkSaveData(data);
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

export function useLinkEditorHandlers(
  editEdge: (id: string | null) => void,
  editingLinkData: LinkEditorData | null,
  edgeAnnotationHandlers?: EdgeAnnotationHandlers,
  updateEdgeData?: (edgeId: string, data: LinkEditorData) => void
) {
  const initialDataRef = React.useRef<LinkEditorData | null>(null);
  const offsetEditSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  React.useEffect(
    () => () => {
      clearOffsetEditSave();
    },
    [clearOffsetEditSave]
  );

  const persistOffset = React.useCallback(
    (data: LinkEditorData) => {
      if (!edgeAnnotationHandlers) return;
      const next = upsertEdgeLabelOffsetAnnotation(edgeAnnotationHandlers.edgeAnnotations, data);
      if (!next) return;
      edgeAnnotationHandlers.setEdgeAnnotations(next);
      void saveEdgeAnnotations(next);
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

      if (isOffsetOnlyChange(beforeData, normalized)) {
        persistOffset(normalized);
        initialDataRef.current = null;
        editEdge(null);
        return;
      }

      applyLinkChanges(normalized, persistDeps);
      const saveData = convertEditorDataToLinkSaveData(normalized);
      void executeTopologyCommand({ command: "editLink", payload: saveData });

      if (edgeAnnotationHandlers) {
        const existing = findEdgeAnnotation(edgeAnnotationHandlers.edgeAnnotations, normalized);
        const shouldUpdate =
          existing &&
          (normalized.endpointLabelOffset !== existing.endpointLabelOffset ||
            normalized.endpointLabelOffsetEnabled !== existing.endpointLabelOffsetEnabled);
        if (shouldUpdate) {
          persistOffset(normalized);
        }
      }

      initialDataRef.current = null;
      editEdge(null);
    },
    [editEdge, persistDeps, persistOffset, edgeAnnotationHandlers]
  );

  const handleApply = React.useCallback(
    (data: LinkEditorData) => {
      const beforeData = initialDataRef.current;
      const normalized = enableLinkEndpointOffset(data);
      const hasChanges = beforeData
        ? JSON.stringify(beforeData) !== JSON.stringify(normalized)
        : true;
      if (!hasChanges) return;

      if (isOffsetOnlyChange(beforeData, normalized)) {
        persistOffset(normalized);
        initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
        return;
      }

      applyLinkChanges(normalized, persistDeps);
      const saveData = convertEditorDataToLinkSaveData(normalized);
      void executeTopologyCommand({ command: "editLink", payload: saveData });

      initialDataRef.current = { ...normalized };
    },
    [persistDeps, persistOffset]
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

      const next = upsertEdgeLabelOffsetAnnotation(
        edgeAnnotationHandlers.edgeAnnotations,
        normalized
      );
      if (!next) return;
      edgeAnnotationHandlers.setEdgeAnnotations(next);

      clearOffsetEditSave();
      offsetEditSaveRef.current = setTimeout(() => {
        void saveEdgeAnnotations(next);
      }, EDGE_OFFSET_SAVE_DEBOUNCE_MS);

      initialDataRef.current = mergeOffsetBaseline(initialDataRef.current, normalized);
    },
    [edgeAnnotationHandlers, clearOffsetEditSave]
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
  if (BRIDGE_NETWORK_TYPES.has(data.networkType)) {
    return data.interfaceName || data.id;
  }
  return data.id;
}

function applyVxlanFields(extraData: Record<string, unknown>, data: NetworkEditorData): void {
  if (!VXLAN_NETWORK_TYPES.has(data.networkType)) return;
  Object.assign(extraData, {
    extRemote: data.vxlanRemote || undefined,
    extVni: data.vxlanVni ? Number(data.vxlanVni) : undefined,
    extDstPort: data.vxlanDstPort ? Number(data.vxlanDstPort) : undefined,
    extSrcPort: data.vxlanSrcPort ? Number(data.vxlanSrcPort) : undefined
  });
}

function applyHostInterfaceFields(
  extraData: Record<string, unknown>,
  data: NetworkEditorData
): void {
  if (!HOST_INTERFACE_TYPES.has(data.networkType)) return;
  extraData.extHostInterface = data.interfaceName || undefined;
  extraData.extMode = data.networkType === "macvlan" ? data.macvlanMode || undefined : undefined;
}

function applyCommonNetworkFields(
  extraData: Record<string, unknown>,
  data: NetworkEditorData
): void {
  Object.assign(extraData, {
    extMtu: data.mtu ? Number(data.mtu) : undefined,
    extMac: data.mac || undefined,
    extVars: data.vars && Object.keys(data.vars).length > 0 ? data.vars : undefined,
    extLabels: data.labels && Object.keys(data.labels).length > 0 ? data.labels : undefined
  });
}

function buildNetworkExtraData(data: NetworkEditorData): Record<string, unknown> {
  const extraData: Record<string, unknown> = { extType: data.networkType };
  applyVxlanFields(extraData, data);
  applyHostInterfaceFields(extraData, data);
  applyCommonNetworkFields(extraData, data);
  return extraData;
}

export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  editingNetworkData: NetworkEditorData | null,
  renameNode?: RenameNodeCallback
) {
  const { edges } = useGraphState();
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

  const applyGraphUpdates = React.useCallback(
    (data: NetworkEditorData, newNodeId: string) => {
      const label = data.label || newNodeId;
      if (data.id !== newNodeId && renameNode) {
        renameNode(data.id, newNodeId, label);
      }
      const extraData = convertNetworkEditorDataToYaml(data);
      const updateNode = useGraphStore.getState().updateNode;
      updateNode(newNodeId, { data: { label, name: label } });
      useGraphStore.getState().updateNodeData(newNodeId, extraData);
    },
    [renameNode]
  );

  const persistLinkBasedNetwork = React.useCallback(
    async (data: NetworkEditorData, newNodeId: string) => {
      if (!LINK_BASED_NETWORK_TYPES.has(data.networkType)) return;

      const extraData = buildNetworkExtraData(data);
      const commands = edges
        .filter((edge) => edge.source === data.id || edge.target === data.id)
        .map((edge) => {
          const sourceEndpoint = (edge.data as Record<string, unknown> | undefined)
            ?.sourceEndpoint as string | undefined;
          const targetEndpoint = (edge.data as Record<string, unknown> | undefined)
            ?.targetEndpoint as string | undefined;
          const nextSource = edge.source === data.id ? newNodeId : edge.source;
          const nextTarget = edge.target === data.id ? newNodeId : edge.target;
          return {
            command: "editLink" as const,
            payload: {
              id: edge.id,
              source: nextSource,
              target: nextTarget,
              sourceEndpoint,
              targetEndpoint,
              extraData,
              originalSource: edge.source,
              originalTarget: edge.target,
              originalSourceEndpoint: sourceEndpoint,
              originalTargetEndpoint: targetEndpoint
            }
          };
        });

      if (commands.length > 0) {
        await executeTopologyCommands(commands, { applySnapshot: false });
      }

      await saveNetworkNodesFromGraph();
    },
    [edges]
  );

  const persistBridgeNetwork = React.useCallback((data: NetworkEditorData, newNodeId: string) => {
    if (!BRIDGE_NETWORK_TYPES.has(data.networkType)) return;

    const saveData = {
      id: data.id,
      name: newNodeId,
      extraData: {
        kind: data.networkType
      }
    };
    void executeTopologyCommand({ command: "editNode", payload: saveData });
  }, []);

  const persistNetworkEdits = React.useCallback(
    async (data: NetworkEditorData, closeAfterSave: boolean) => {
      const beforeData = initialDataRef.current;
      const hasChanges = beforeData ? JSON.stringify(beforeData) !== JSON.stringify(data) : true;
      if (!hasChanges) {
        if (closeAfterSave) {
          editNetwork(null);
        }
        return;
      }

      const newNodeId = calculateExpectedNodeId(data);

      applyGraphUpdates(data, newNodeId);

      if (LINK_BASED_NETWORK_TYPES.has(data.networkType)) {
        await persistLinkBasedNetwork(data, newNodeId);
      } else if (BRIDGE_NETWORK_TYPES.has(data.networkType)) {
        persistBridgeNetwork(data, newNodeId);
      }

      if (closeAfterSave) {
        initialDataRef.current = null;
        editNetwork(null);
        return;
      }

      initialDataRef.current = { ...data };
    },
    [editNetwork, applyGraphUpdates, persistLinkBasedNetwork, persistBridgeNetwork]
  );

  const handleSave = React.useCallback(
    (data: NetworkEditorData) => {
      return persistNetworkEdits(data, true);
    },
    [persistNetworkEdits]
  );

  const handleApply = React.useCallback(
    (data: NetworkEditorData) => {
      return persistNetworkEdits(data, false);
    },
    [persistNetworkEdits]
  );

  return { handleClose, handleSave, handleApply };
}

// ============================================================================
// useNodeCreationHandlers
// ============================================================================

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
