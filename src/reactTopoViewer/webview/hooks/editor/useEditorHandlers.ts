/**
 * Editor handler hooks for node, link, and network editors.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  CustomNodeTemplate,
  LinkEditorData,
  NetworkEditorData,
  NodeEditorData
} from "../../../shared/types/editors";
import type { EdgeAnnotation, NodeAnnotation } from "../../../shared/types/topology";
import {
  convertEditorDataToYaml,
  convertEditorDataToNodeSaveData,
  convertNetworkEditorDataToYaml
} from "../../../shared/utilities";
import type { FloatingActionPanelHandle } from "../../components/panels/floatingPanel/FloatingActionPanel";
import {
  executeTopologyCommand,
  executeTopologyCommands,
  saveEdgeAnnotations,
  saveNetworkNodesFromGraph
} from "../../services";
import { requestSnapshot } from "../../services/topologyHostClient";
import { useGraphState, useGraphStore } from "../../stores/graphStore";
import {
  findEdgeAnnotation,
  upsertEdgeLabelOffsetAnnotation
} from "../../annotations/edgeAnnotations";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import { BRIDGE_NETWORK_TYPES, getNetworkType } from "../../utils/networkNodeTypes";
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
  // Include annotation properties for visual updates (icon, color, corner radius)
  // These are needed by graphStore.updateNodeData to update the canvas rendering
  if (data.icon !== undefined) {
    newExtraData.topoViewerRole = data.icon;
  }
  if (data.iconColor !== undefined) {
    newExtraData.iconColor = data.iconColor;
  }
  if (data.iconCornerRadius !== undefined) {
    newExtraData.iconCornerRadius = data.iconCornerRadius;
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

function needsDefaultCleanup(data: NodeEditorData | null): boolean {
  if (!data) return false;
  return (
    data.autoRemove === false ||
    data.enforceStartupConfig === false ||
    data.suppressStartupConfig === false ||
    data.startupDelay === 0
  );
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
      if (!hasChanges && !needsDefaultCleanup(data)) {
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
      if (!hasChanges && !needsDefaultCleanup(data)) return;

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

function sanitizeLinkExtraData(
  extraData?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!extraData) return undefined;
  const cleaned = { ...extraData };
  delete cleaned.yamlSourceNodeId;
  delete cleaned.yamlTargetNodeId;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  editingNetworkData: NetworkEditorData | null,
  renameNode?: RenameNodeCallback
) {
  const { edges, nodes } = useGraphState();
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
      let label = data.label || newNodeId;
      if (HOST_INTERFACE_TYPES.has(data.networkType)) {
        const isDefaultLabel = !data.label || data.label === data.id;
        if (isDefaultLabel) {
          label = newNodeId;
        }
      }
      if (data.id !== newNodeId && renameNode) {
        renameNode(data.id, newNodeId, label);
      }
      const graphState = useGraphStore.getState();
      const updateNode = graphState.updateNode;
      const updateNodeData = graphState.updateNodeData;
      const existingNode =
        graphState.nodes.find((node) => node.id === newNodeId) ??
        graphState.nodes.find((node) => node.id === data.id);
      const existingExtra =
        ((existingNode?.data as Record<string, unknown> | undefined)?.extraData as
          | Record<string, unknown>
          | undefined) ?? {};

      let nextExtraData: Record<string, unknown>;
      if (BRIDGE_NETWORK_TYPES.has(data.networkType)) {
        // Preserve bridge metadata (e.g., extYamlNodeId) while updating kind.
        nextExtraData = { ...existingExtra, ...convertNetworkEditorDataToYaml(data) };
      } else if (LINK_BASED_NETWORK_TYPES.has(data.networkType)) {
        // Mirror main-branch behavior: keep only network link properties on the node.
        nextExtraData = buildNetworkExtraData(data);
      } else {
        nextExtraData = convertNetworkEditorDataToYaml(data);
      }

      updateNode(newNodeId, { data: { label, name: label } });
      updateNodeData(newNodeId, nextExtraData);
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
        kind: data.networkType,
        label: data.label?.trim() ? data.label.trim() : null
      }
    };
    void executeTopologyCommand({ command: "editNode", payload: saveData });
  }, []);

  const persistBridgeAlias = React.useCallback(
    async (data: NetworkEditorData, newNodeId: string) => {
      if (!BRIDGE_NETWORK_TYPES.has(data.networkType)) return false;
      if (!newNodeId || newNodeId === data.id) return false;

      const baseNode = nodes.find((node) => node.id === newNodeId);
      if (!baseNode) return false;
      const baseType = getNetworkType((baseNode.data ?? {}) as Record<string, unknown>);
      if (!baseType || !BRIDGE_NETWORK_TYPES.has(baseType)) return false;

      const aliasId = data.id;
      const connectedEdges = edges.filter(
        (edge) => edge.source === aliasId || edge.target === aliasId
      );

      const edgeInfos = connectedEdges.map((edge) => {
        const edgeData = (edge.data ?? {}) as {
          sourceEndpoint?: string;
          targetEndpoint?: string;
          extraData?: Record<string, unknown>;
        };
        const interfaceName =
          edge.source === aliasId ? edgeData.sourceEndpoint : edgeData.targetEndpoint;
        return {
          edge,
          interfaceName
        };
      });

      const interfaceSet = new Set(
        edgeInfos
          .map((info) => info.interfaceName)
          .filter((iface): iface is string => typeof iface === "string" && iface.length > 0)
      );

      const snapshot = await requestSnapshot();
      const annotations = snapshot.annotations ?? {};
      const nodeAnnotations = [...(annotations.nodeAnnotations ?? [])];
      const existingAnn = nodeAnnotations.find((ann) => ann.id === aliasId);
      const existingInterface =
        typeof existingAnn?.yamlInterface === "string" && existingAnn.yamlInterface.trim()
          ? existingAnn.yamlInterface.trim()
          : undefined;
      const aliasAlreadyMapped =
        existingAnn?.yamlNodeId === newNodeId && Boolean(existingInterface);
      const interfaceCandidates = interfaceSet.size > 0 ? Array.from(interfaceSet) : [];
      const primaryInterface =
        (existingInterface && interfaceSet.has(existingInterface)) ||
        (existingInterface && interfaceSet.size === 0)
          ? existingInterface
          : interfaceCandidates[0];

      if (!primaryInterface) {
        return false;
      }

      const graphState = useGraphStore.getState();
      const aliasNode = graphState.nodes.find((node) => node.id === aliasId);
      const aliasLabel = data.label?.trim() || aliasId;
      const existingExtra =
        ((aliasNode?.data as Record<string, unknown> | undefined)?.extraData as
          | Record<string, unknown>
          | undefined) ?? {};
      const nextExtra = {
        ...existingExtra,
        ...convertNetworkEditorDataToYaml(data),
        extYamlNodeId: newNodeId
      };

      graphState.updateNode(aliasId, { data: { label: aliasLabel, name: aliasLabel } });
      graphState.updateNodeData(aliasId, nextExtra);

      const updatedAnnotations: NodeAnnotation[] = nodeAnnotations.filter(
        (ann) => ann.id !== aliasId
      );
      const aliasAnnotation: NodeAnnotation = {
        ...(existingAnn ?? { id: aliasId }),
        id: aliasId,
        yamlNodeId: newNodeId,
        yamlInterface: primaryInterface,
        label: aliasLabel
      };
      if (!aliasAnnotation.position && aliasNode?.position) {
        aliasAnnotation.position = aliasNode.position;
      }
      updatedAnnotations.push(aliasAnnotation);

      const linkCommands = edgeInfos.map((info) => {
        const edgeData = info.edge.data as
          | {
              sourceEndpoint?: string;
              targetEndpoint?: string;
              extraData?: Record<string, unknown>;
            }
          | undefined;
        const extra = edgeData?.extraData;
        const yamlSource =
          typeof extra?.yamlSourceNodeId === "string" && extra.yamlSourceNodeId.length > 0
            ? extra.yamlSourceNodeId
            : aliasAlreadyMapped && info.edge.source === aliasId
              ? newNodeId
              : info.edge.source;
        const yamlTarget =
          typeof extra?.yamlTargetNodeId === "string" && extra.yamlTargetNodeId.length > 0
            ? extra.yamlTargetNodeId
            : aliasAlreadyMapped && info.edge.target === aliasId
              ? newNodeId
              : info.edge.target;
        const nextSource = info.edge.source === aliasId ? newNodeId : info.edge.source;
        const nextTarget = info.edge.target === aliasId ? newNodeId : info.edge.target;
        return {
          command: "editLink" as const,
          payload: {
            id: info.edge.id,
            source: nextSource,
            target: nextTarget,
            sourceEndpoint: edgeData?.sourceEndpoint,
            targetEndpoint: edgeData?.targetEndpoint,
            extraData: sanitizeLinkExtraData(extra),
            originalSource: yamlSource,
            originalTarget: yamlTarget,
            originalSourceEndpoint: edgeData?.sourceEndpoint,
            originalTargetEndpoint: edgeData?.targetEndpoint
          }
        };
      });

      if (linkCommands.length > 0) {
        await executeTopologyCommands(linkCommands, { applySnapshot: false });
      }

      await executeTopologyCommand(
        { command: "deleteNode", payload: { id: aliasId } },
        { applySnapshot: false }
      );

      await executeTopologyCommand(
        { command: "setAnnotations", payload: { nodeAnnotations: updatedAnnotations } },
        { applySnapshot: false }
      );

      edgeInfos.forEach((info) => {
        const edgeData = (info.edge.data ?? {}) as Record<string, unknown>;
        const extra = { ...(edgeData.extraData as Record<string, unknown> | undefined) };
        const shouldStayOnAlias = info.interfaceName === primaryInterface;
        const nextSource =
          !shouldStayOnAlias && info.edge.source === aliasId ? newNodeId : info.edge.source;
        const nextTarget =
          !shouldStayOnAlias && info.edge.target === aliasId ? newNodeId : info.edge.target;
        if (info.edge.source === aliasId) {
          if (shouldStayOnAlias) {
            extra.yamlSourceNodeId = newNodeId;
          } else {
            delete extra.yamlSourceNodeId;
          }
        }
        if (info.edge.target === aliasId) {
          if (shouldStayOnAlias) {
            extra.yamlTargetNodeId = newNodeId;
          } else {
            delete extra.yamlTargetNodeId;
          }
        }

        graphState.updateEdge(info.edge.id, {
          source: nextSource,
          target: nextTarget,
          data: { ...edgeData, extraData: extra }
        });
      });

      return true;
    },
    [edges, nodes]
  );

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

      if (BRIDGE_NETWORK_TYPES.has(data.networkType)) {
        const aliasHandled = await persistBridgeAlias(data, newNodeId);
        if (aliasHandled) {
          if (closeAfterSave) {
            initialDataRef.current = null;
            editNetwork(null);
            return;
          }
          initialDataRef.current = { ...data };
          return;
        }
      }

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
    [
      editNetwork,
      applyGraphUpdates,
      persistLinkBasedNetwork,
      persistBridgeNetwork,
      persistBridgeAlias
    ]
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
