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
import {
  executeTopologyCommand,
  saveEdgeAnnotations,
  buildNetworkNodeAnnotations
} from "../../services";
import { requestSnapshot } from "../../services/topologyHostClient";
import { useGraphStore } from "../../stores/graphStore";
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

type BasicNode = { id: string; data?: unknown; position?: { x: number; y: number } };
type BasicEdge = { id: string; source: string; target: string; data?: unknown };
type AliasEdgeInfo = { edge: BasicEdge; interfaceName?: string };
type GraphState = ReturnType<typeof useGraphStore.getState>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (value == null || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getEdgeData(edge: BasicEdge): {
  sourceEndpoint?: string;
  targetEndpoint?: string;
  extraData?: Record<string, unknown>;
} {
  const data = toRecord(edge.data);
  return {
    sourceEndpoint: typeof data?.sourceEndpoint === "string" ? data.sourceEndpoint : undefined,
    targetEndpoint: typeof data?.targetEndpoint === "string" ? data.targetEndpoint : undefined,
    extraData: toRecord(data?.extraData)
  };
}

function getNodeExtraData(node: { data?: unknown } | undefined): Record<string, unknown> {
  const data = toRecord(node?.data);
  const extraData = toRecord(data?.extraData);
  return extraData ? { ...extraData } : {};
}

// ============================================================================
// Shared Helper Functions
// ============================================================================

function updateNodeExtraData(data: NodeEditorData): Record<string, unknown> {
  const recordData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    recordData[key] = value;
  }
  const yamlExtraData = convertEditorDataToYaml(recordData);
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
  if (data.labelPosition !== undefined) {
    newExtraData.labelPosition = data.labelPosition;
  }
  if (data.direction !== undefined) {
    newExtraData.direction = data.direction;
  }
  if ("labelBackgroundColor" in data) {
    newExtraData.labelBackgroundColor = data.labelBackgroundColor;
  }
  return newExtraData;
}

function updateNodeVisualPreview(
  nodeId: string,
  labelPosition: string | undefined,
  direction: string | undefined,
  labelBackgroundColor: string | undefined
): void {
  const graphState = useGraphStore.getState();
  const node = graphState.nodes.find((entry) => entry.id === nodeId);
  if (!node) return;
  const currentData = node.data;
  if (
    currentData.labelPosition === labelPosition &&
    currentData.direction === direction &&
    currentData.labelBackgroundColor === labelBackgroundColor
  ) {
    return;
  }
  graphState.updateNode(nodeId, {
    data: {
      labelPosition,
      direction,
      labelBackgroundColor
    }
  });
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
  const hasOldName = oldName != null && oldName.length > 0;
  if (hasOldName && renameNode) {
    renameNode(oldName, data.name, data.name);
  }

  if (updateNodeData) {
    const nodeIdForUpdate = hasOldName ? data.name : data.id;
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

function isBridgeAliasCandidate(
  data: NetworkEditorData,
  newNodeId: string,
  nodes: BasicNode[]
): boolean {
  if (!BRIDGE_NETWORK_TYPES.has(data.networkType)) return false;
  if (!newNodeId || newNodeId === data.id) return false;
  const baseNode = nodes.find((node) => node.id === newNodeId);
  if (!baseNode) return false;
  const baseType = getNetworkType(toRecord(baseNode.data) ?? {});
  return baseType != null && baseType.length > 0 && BRIDGE_NETWORK_TYPES.has(baseType);
}

function collectAliasEdgeInfos(edges: BasicEdge[], aliasId: string): AliasEdgeInfo[] {
  const edgeInfos: AliasEdgeInfo[] = [];
  for (const edge of edges) {
    if (edge.source !== aliasId && edge.target !== aliasId) continue;
    const edgeData = getEdgeData(edge);
    const interfaceName =
      edge.source === aliasId ? edgeData.sourceEndpoint : edgeData.targetEndpoint;
    edgeInfos.push({ edge, interfaceName });
  }
  return edgeInfos;
}

function extractInterfaceCandidates(edgeInfos: AliasEdgeInfo[]): {
  interfaceSet: Set<string>;
  interfaceCandidates: string[];
} {
  const interfaceSet = new Set<string>();
  for (const info of edgeInfos) {
    if (typeof info.interfaceName === "string" && info.interfaceName.length > 0) {
      interfaceSet.add(info.interfaceName);
    }
  }
  return { interfaceSet, interfaceCandidates: Array.from(interfaceSet) };
}

function resolvePrimaryInterface(
  existingInterface: string | undefined,
  interfaceSet: Set<string>,
  interfaceCandidates: string[]
): string | undefined {
  if (
    existingInterface != null &&
    existingInterface.length > 0 &&
    (interfaceSet.has(existingInterface) || interfaceSet.size === 0)
  ) {
    return existingInterface;
  }
  return interfaceCandidates[0];
}

function resolveYamlEndpoint(
  extra: Record<string, unknown> | undefined,
  key: "yamlSourceNodeId" | "yamlTargetNodeId",
  aliasAlreadyMapped: boolean,
  aliasMatches: boolean,
  newNodeId: string,
  fallback: string
): string {
  const value = extra?.[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (aliasAlreadyMapped && aliasMatches) {
    return newNodeId;
  }
  return fallback;
}

function buildAliasLinkCommand(
  info: AliasEdgeInfo,
  aliasId: string,
  newNodeId: string,
  aliasAlreadyMapped: boolean
) {
  const edgeData = getEdgeData(info.edge);
  const extra = edgeData.extraData;
  const yamlSource = resolveYamlEndpoint(
    extra,
    "yamlSourceNodeId",
    aliasAlreadyMapped,
    info.edge.source === aliasId,
    newNodeId,
    info.edge.source
  );
  const yamlTarget = resolveYamlEndpoint(
    extra,
    "yamlTargetNodeId",
    aliasAlreadyMapped,
    info.edge.target === aliasId,
    newNodeId,
    info.edge.target
  );
  const nextSource = info.edge.source === aliasId ? newNodeId : info.edge.source;
  const nextTarget = info.edge.target === aliasId ? newNodeId : info.edge.target;
  return {
    command: "editLink" as const,
    payload: {
      id: info.edge.id,
      source: nextSource,
      target: nextTarget,
      sourceEndpoint: edgeData.sourceEndpoint,
      targetEndpoint: edgeData.targetEndpoint,
      extraData: sanitizeLinkExtraData(extra),
      originalSource: yamlSource,
      originalTarget: yamlTarget,
      originalSourceEndpoint: edgeData.sourceEndpoint,
      originalTargetEndpoint: edgeData.targetEndpoint
    }
  };
}

function updateAliasNodeInGraph(
  graphState: GraphState,
  aliasId: string,
  aliasLabel: string,
  data: NetworkEditorData,
  newNodeId: string
): BasicNode | undefined {
  const aliasNode = graphState.nodes.find((node) => node.id === aliasId) as BasicNode | undefined;
  const existingExtra = getNodeExtraData(aliasNode);
  const nextExtra = {
    ...existingExtra,
    ...convertNetworkEditorDataToYaml(data),
    extYamlNodeId: newNodeId
  };
  graphState.updateNode(aliasId, { data: { label: aliasLabel, name: aliasLabel } });
  graphState.updateNodeData(aliasId, nextExtra);
  return aliasNode;
}

function buildUpdatedAliasAnnotations(
  nodeAnnotations: NodeAnnotation[],
  existingAnn: NodeAnnotation | undefined,
  aliasId: string,
  newNodeId: string,
  primaryInterface: string,
  aliasLabel: string,
  aliasPosition?: { x: number; y: number }
): NodeAnnotation[] {
  const updatedAnnotations: NodeAnnotation[] = nodeAnnotations.filter((ann) => ann.id !== aliasId);
  const aliasAnnotation: NodeAnnotation = {
    ...(existingAnn ?? { id: aliasId }),
    id: aliasId,
    yamlNodeId: newNodeId,
    yamlInterface: primaryInterface,
    label: aliasLabel
  };
  if (!aliasAnnotation.position && aliasPosition) {
    aliasAnnotation.position = aliasPosition;
  }
  updatedAnnotations.push(aliasAnnotation);
  return updatedAnnotations;
}

function updateAliasYamlIds(
  info: AliasEdgeInfo,
  extra: Record<string, unknown>,
  aliasId: string,
  newNodeId: string,
  shouldStayOnAlias: boolean
): void {
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
}

function buildAliasEdgeUpdate(
  info: AliasEdgeInfo,
  aliasId: string,
  newNodeId: string,
  primaryInterface: string
): {
  edgeData: Record<string, unknown>;
  extra: Record<string, unknown>;
  nextSource: string;
  nextTarget: string;
} {
  const edgeData = toRecord(info.edge.data) ?? {};
  const extra: Record<string, unknown> = {};
  const existingExtra = toRecord(edgeData.extraData);
  if (existingExtra) {
    Object.assign(extra, existingExtra);
  }
  const shouldStayOnAlias = info.interfaceName === primaryInterface;
  const nextSource =
    !shouldStayOnAlias && info.edge.source === aliasId ? newNodeId : info.edge.source;
  const nextTarget =
    !shouldStayOnAlias && info.edge.target === aliasId ? newNodeId : info.edge.target;
  updateAliasYamlIds(info, extra, aliasId, newNodeId, shouldStayOnAlias);
  return { edgeData, extra, nextSource, nextTarget };
}

function updateGraphEdgesForAlias(
  graphState: GraphState,
  edgeInfos: AliasEdgeInfo[],
  aliasId: string,
  newNodeId: string,
  primaryInterface: string
): void {
  for (const info of edgeInfos) {
    const { edgeData, extra, nextSource, nextTarget } = buildAliasEdgeUpdate(
      info,
      aliasId,
      newNodeId,
      primaryInterface
    );
    graphState.updateEdge(info.edge.id, {
      source: nextSource,
      target: nextTarget,
      data: { ...edgeData, extraData: extra }
    });
  }
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
    const previous = initialDataRef.current;
    if (previous && previous.id !== editingNodeData?.id) {
      updateNodeVisualPreview(
        previous.id,
        previous.labelPosition,
        previous.direction,
        previous.labelBackgroundColor
      );
    }
    if (editingNodeData) {
      initialDataRef.current = { ...editingNodeData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingNodeData?.id]);

  const handleClose = React.useCallback(() => {
    const initialData = initialDataRef.current;
    if (initialData) {
      updateNodeVisualPreview(
        initialData.id,
        initialData.labelPosition,
        initialData.direction,
        initialData.labelBackgroundColor
      );
    }
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

  const previewVisuals = React.useCallback((data: NodeEditorData) => {
    const initialData = initialDataRef.current;
    if (!initialData) return;
    updateNodeVisualPreview(
      initialData.id,
      data.labelPosition,
      data.direction,
      data.labelBackgroundColor
    );
  }, []);

  return { handleClose, handleSave, handleApply, previewVisuals };
}

// ============================================================================
// useLinkEditorHandlers
// ============================================================================

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
  const {
    endpointLabelOffset: _endpointLabelOffset,
    endpointLabelOffsetEnabled: _endpointLabelOffsetEnabled,
    ...rest
  } = data;
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
      sourceEndpoint: saveData.sourceEndpoint ?? data.sourceEndpoint,
      targetEndpoint: saveData.targetEndpoint ?? data.targetEndpoint
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

  React.useEffect(() => {
    if (editingLinkData) {
      initialDataRef.current = { ...editingLinkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingLinkData?.id]);

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
          existing != null &&
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

  // Visual-only offset preview (no persist)
  const previewOffset = React.useCallback(
    (data: LinkEditorData) => {
      if (!edgeAnnotationHandlers) return;
      const normalized = enableLinkEndpointOffset(data);
      const next = upsertEdgeLabelOffsetAnnotation(
        edgeAnnotationHandlers.edgeAnnotations,
        normalized
      );
      if (!next) return;
      edgeAnnotationHandlers.setEdgeAnnotations(next);
    },
    [edgeAnnotationHandlers]
  );

  // Revert offset to initial state (for discard / unmount)
  const revertOffset = React.useCallback(() => {
    if (!edgeAnnotationHandlers || !initialDataRef.current) return;
    const next = upsertEdgeLabelOffsetAnnotation(
      edgeAnnotationHandlers.edgeAnnotations,
      initialDataRef.current
    );
    if (!next) return;
    edgeAnnotationHandlers.setEdgeAnnotations(next);
  }, [edgeAnnotationHandlers]);

  return { handleClose, handleSave, handleApply, previewOffset, revertOffset };
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
    extRemote: data.vxlanRemote ?? undefined,
    extVni: toOptionalNumber(data.vxlanVni),
    extDstPort: toOptionalNumber(data.vxlanDstPort),
    extSrcPort: toOptionalNumber(data.vxlanSrcPort)
  });
}

function applyHostInterfaceFields(
  extraData: Record<string, unknown>,
  data: NetworkEditorData
): void {
  if (!HOST_INTERFACE_TYPES.has(data.networkType)) return;
  extraData.extHostInterface = data.interfaceName || undefined;
  extraData.extMode = data.networkType === "macvlan" ? (data.macvlanMode ?? undefined) : undefined;
}

function applyCommonNetworkFields(
  extraData: Record<string, unknown>,
  data: NetworkEditorData
): void {
  Object.assign(extraData, {
    extMtu: toOptionalNumber(data.mtu),
    extMac: data.mac ?? undefined,
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

function getConnectedNetworkEdges(edges: BasicEdge[], networkNodeId: string): BasicEdge[] {
  return edges.filter((edge) => edge.source === networkNodeId || edge.target === networkNodeId);
}

export function useNetworkEditorHandlers(
  editNetwork: (id: string | null) => void,
  editingNetworkData: NetworkEditorData | null,
  renameNode?: RenameNodeCallback
) {
  const initialDataRef = React.useRef<NetworkEditorData | null>(null);
  const getCurrentEdges = React.useCallback(() => useGraphStore.getState().edges, []);
  const getCurrentNodes = React.useCallback(() => useGraphStore.getState().nodes, []);

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
      const existingExtra = getNodeExtraData(existingNode);

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
    async (data: NetworkEditorData, newNodeId: string, connectedEdges: BasicEdge[]) => {
      if (!LINK_BASED_NETWORK_TYPES.has(data.networkType)) return;

      const extraData = buildNetworkExtraData(data);
      const linkCommands = connectedEdges.map((edge) => {
        const edgeData = getEdgeData(edge);
        const sourceEndpoint = edgeData.sourceEndpoint;
        const targetEndpoint = edgeData.targetEndpoint;
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

      const graphNodes = useGraphStore.getState().nodes;
      const networkNodeAnnotations = buildNetworkNodeAnnotations(graphNodes);
      const commands = [
        ...linkCommands,
        {
          command: "setAnnotations" as const,
          payload: { networkNodeAnnotations }
        }
      ];

      if (commands.length > 0) {
        await executeTopologyCommand(
          { command: "batch", payload: { commands } },
          { applySnapshot: false }
        );
      }
    },
    []
  );

  const persistBridgeNetwork = React.useCallback((data: NetworkEditorData, newNodeId: string) => {
    if (!BRIDGE_NETWORK_TYPES.has(data.networkType)) return;

    const trimmedLabel = data.label.trim();
    const saveData = {
      id: data.id,
      name: newNodeId,
      extraData: {
        kind: data.networkType,
        label: trimmedLabel.length > 0 ? trimmedLabel : null
      }
    };
    void executeTopologyCommand({ command: "editNode", payload: saveData });
  }, []);

  const persistBridgeAlias = React.useCallback(
    async (data: NetworkEditorData, newNodeId: string) => {
      const currentNodes = getCurrentNodes();
      if (!isBridgeAliasCandidate(data, newNodeId, currentNodes as BasicNode[])) return false;

      const aliasId = data.id;
      const currentEdges = getCurrentEdges();
      const edgeInfos = collectAliasEdgeInfos(currentEdges as BasicEdge[], aliasId);
      const { interfaceSet, interfaceCandidates } = extractInterfaceCandidates(edgeInfos);

      const snapshot = await requestSnapshot();
      const annotations = snapshot.annotations;
      const nodeAnnotations = [...(annotations.nodeAnnotations ?? [])];
      const existingAnn = nodeAnnotations.find((ann) => ann.id === aliasId);
      const existingInterface =
        typeof existingAnn?.yamlInterface === "string" && existingAnn.yamlInterface.trim()
          ? existingAnn.yamlInterface.trim()
          : undefined;
      const aliasAlreadyMapped =
        existingAnn?.yamlNodeId === newNodeId && Boolean(existingInterface);
      const primaryInterface = resolvePrimaryInterface(
        existingInterface,
        interfaceSet,
        interfaceCandidates
      );

      if (primaryInterface == null || primaryInterface.length === 0) {
        return false;
      }

      const graphState = useGraphStore.getState();
      const trimmedLabel = data.label.trim();
      const aliasLabel = trimmedLabel.length > 0 ? trimmedLabel : aliasId;
      const aliasNode = updateAliasNodeInGraph(graphState, aliasId, aliasLabel, data, newNodeId);
      const updatedAnnotations = buildUpdatedAliasAnnotations(
        nodeAnnotations,
        existingAnn,
        aliasId,
        newNodeId,
        primaryInterface,
        aliasLabel,
        aliasNode?.position
      );

      const linkCommands = edgeInfos.map((info) =>
        buildAliasLinkCommand(info, aliasId, newNodeId, aliasAlreadyMapped)
      );

      const aliasCommands = [
        ...linkCommands,
        { command: "deleteNode" as const, payload: { id: aliasId } },
        { command: "setAnnotations" as const, payload: { nodeAnnotations: updatedAnnotations } }
      ];

      await executeTopologyCommand(
        { command: "batch", payload: { commands: aliasCommands } },
        { applySnapshot: false }
      );

      updateGraphEdgesForAlias(graphState, edgeInfos, aliasId, newNodeId, primaryInterface);

      return true;
    },
    [getCurrentEdges, getCurrentNodes]
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
      const preRenameConnectedEdges = LINK_BASED_NETWORK_TYPES.has(data.networkType)
        ? getConnectedNetworkEdges(getCurrentEdges() as BasicEdge[], data.id)
        : [];

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
        await persistLinkBasedNetwork(data, newNodeId, preRenameConnectedEdges);
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
      getCurrentEdges,
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
  onLockedAction: (() => void) | undefined,
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
        onLockedAction?.();
        return;
      }

      let template: CustomNodeTemplate | undefined;
      if (templateName != null && templateName.length > 0) {
        template = state.customNodes.find((n) => n.name === templateName);
      } else if (state.defaultNode.length > 0) {
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
      onLockedAction,
      onNewCustomNode,
      rfInstance
    ]
  );

  return { handleAddNodeFromPanel };
}
