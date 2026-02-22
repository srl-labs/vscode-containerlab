// App content — UI composition for the React TopoViewer.
/* eslint-disable import-x/max-dependencies */
import React from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";

import { ContainerlabExplorerView } from "../../webviews/explorer/containerlabExplorerView.webview";
import type { NetemState } from "../shared/parsing";
import type { TopoEdge, TopoNode, TopologyHostCommand } from "../shared/types";

import { MuiThemeProvider } from "./theme";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE,
  GROUP_NODE_TYPE,
  findEdgeAnnotationInLookup,
  nodesToAnnotations,
  collectNodeGroupMemberships,
  parseEndpointLabelOffset
} from "./annotations";
import {
  buildEdgeAnnotationLookup,
  type EdgeAnnotationLookup
} from "./annotations/edgeAnnotations";
import type { ReactFlowCanvasRef } from "./components/canvas";
import { ReactFlowCanvas } from "./components/canvas";
import { Navbar } from "./components/navbar/Navbar";
import { AboutModal, type LinkImpairmentData } from "./components/panels";
import { ContextPanel } from "./components/panels/context-panel";
import { LabSettingsModal } from "./components/panels/lab-settings/LabSettingsModal";
import { LifecycleProgressModal } from "./components/panels/LifecycleProgressModal";
import { ShortcutsModal } from "./components/panels/ShortcutsModal";
import { SvgExportModal } from "./components/panels/SvgExportModal";
import { BulkLinkModal } from "./components/panels/BulkLinkModal";
import { GridSettingsPopover } from "./components/panels/GridSettingsPopover";
import { FindNodePopover } from "./components/panels/FindNodePopover";
import { ShortcutDisplay, ToastContainer } from "./components/ui";
import { EasterEggRenderer, useEasterEgg } from "./easter-eggs";
import {
  useAppEditorBindings,
  useAppE2EExposure,
  useAppGraphHandlers,
  useAppKeyboardShortcuts,
  useAppToasts,
  useClipboardHandlers,
  useCustomNodeCommands,
  useDevMockTrafficStats,
  useGraphCreation,
  useIconReconciliation,
  useUndoRedoControls
} from "./hooks/app";
import { useFilteredGraphElements, useSelectionData } from "./hooks/app/useAppContentHelpers";
import { useAnnotations, useDerivedAnnotations, type AnnotationContextValue } from "./hooks/canvas";
import {
  useAppHandlers,
  useContextMenuHandlers,
  usePanelVisibility,
  useShakeAnimation,
  useShortcutDisplay,
  type useLayoutControls
} from "./hooks/ui";
import {
  useAnnotationUIActions,
  useAnnotationUIState,
  useGraphActions,
  useGraphState,
  useGraphStore,
  useTopoViewerActions,
  useTopoViewerState
} from "./stores";
import { sendCancelLabLifecycle } from "./messaging/extensionMessaging";
import { executeTopologyCommand, toLinkSaveData, getCustomIconMap } from "./services";
import {
  PENDING_NETEM_KEY,
  areNetemEquivalent,
  createPendingNetemOverride
} from "./utils/netemOverrides";

type LayoutControls = ReturnType<typeof useLayoutControls>;
const DEV_EXPLORER_MIN_WIDTH = 280;
const DEV_EXPLORER_DEFAULT_WIDTH = 360;

const TOPO_NODE_TYPES = new Set<string>([
  "topology-node",
  "network-node",
  GROUP_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE
]);
const NETWORK_TYPE_VALUES = new Set<string>([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
  "bridge",
  "ovs-bridge"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toNetemState(value: unknown): NetemState | undefined {
  if (!isRecord(value)) return undefined;
  const state: NetemState = {};
  if (typeof value.delay === "string") state.delay = value.delay;
  if (typeof value.jitter === "string") state.jitter = value.jitter;
  if (typeof value.loss === "string") state.loss = value.loss;
  if (typeof value.rate === "string") state.rate = value.rate;
  if (typeof value.corruption === "string") state.corruption = value.corruption;
  return Object.keys(state).length > 0 ? state : undefined;
}

function isTopoNode(node: Node): node is TopoNode {
  return TOPO_NODE_TYPES.has(node.type ?? "");
}

function isTopoEdge(edge: Edge): edge is TopoEdge {
  const data = edge.data;
  return (
    isRecord(data) &&
    typeof data.sourceEndpoint === "string" &&
    typeof data.targetEndpoint === "string"
  );
}

function isNetworkTypeValue(
  value: string
): value is Parameters<ReturnType<typeof useGraphCreation>["createNetworkAtPosition"]>[1] {
  return NETWORK_TYPE_VALUES.has(value);
}

function getDevExplorerMaxWidth(): number {
  return Math.max(DEV_EXPLORER_MIN_WIDTH, Math.floor(window.innerWidth / 2));
}

interface DeleteMenuHandlers {
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
}

interface DeleteGraphActions {
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
}

function collectSelectedIds(
  nodes: Array<{ id: string; selected?: boolean }>,
  edges: Array<{ id: string; selected?: boolean }>,
  selectedNodeId?: string | null,
  selectedEdgeId?: string | null
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set(nodes.filter((node) => node.selected === true).map((node) => node.id));
  const edgeIds = new Set(edges.filter((edge) => edge.selected === true).map((edge) => edge.id));

  if (selectedNodeId != null && selectedNodeId.length > 0) nodeIds.add(selectedNodeId);
  if (selectedEdgeId != null && selectedEdgeId.length > 0) edgeIds.add(selectedEdgeId);

  return { nodeIds, edgeIds };
}

function splitNodeIdsByType(
  nodeIds: Set<string>,
  nodesById: Map<string, { type?: string }>
): {
  graphNodeIds: string[];
  groupIds: string[];
  textIds: string[];
  shapeIds: string[];
  trafficRateIds: string[];
} {
  const graphNodeIds: string[] = [];
  const groupIds: string[] = [];
  const textIds: string[] = [];
  const shapeIds: string[] = [];
  const trafficRateIds: string[] = [];

  for (const nodeId of nodeIds) {
    const node = nodesById.get(nodeId);
    if (!node) continue;
    switch (node.type) {
      case GROUP_NODE_TYPE:
        groupIds.push(nodeId);
        break;
      case FREE_TEXT_NODE_TYPE:
        textIds.push(nodeId);
        break;
      case FREE_SHAPE_NODE_TYPE:
        shapeIds.push(nodeId);
        break;
      case TRAFFIC_RATE_NODE_TYPE:
        trafficRateIds.push(nodeId);
        break;
      default:
        graphNodeIds.push(nodeId);
    }
  }

  return { graphNodeIds, groupIds, textIds, shapeIds, trafficRateIds };
}

function applyGraphDeletions(
  graphActions: DeleteGraphActions,
  menuHandlers: DeleteMenuHandlers,
  graphNodeIds: string[],
  edgeIds: Set<string>
): void {
  for (const nodeId of graphNodeIds) {
    graphActions.removeNodeAndEdges(nodeId);
    menuHandlers.handleDeleteNode(nodeId);
  }

  for (const edgeId of edgeIds) {
    graphActions.removeEdge(edgeId);
    menuHandlers.handleDeleteLink(edgeId);
  }
}

function buildDeleteCommands(
  graphNodeIds: string[],
  edgeIds: Set<string>,
  edgesById: Map<string, TopoEdge>
): TopologyHostCommand[] {
  const commands: TopologyHostCommand[] = [];

  for (const nodeId of graphNodeIds) {
    commands.push({ command: "deleteNode", payload: { id: nodeId } });
  }

  for (const edgeId of edgeIds) {
    const edge = edgesById.get(edgeId);
    if (!edge) continue;
    commands.push({ command: "deleteLink", payload: toLinkSaveData(edge) });
  }

  return commands;
}

function buildAnnotationSaveCommand(graphNodesForSave: TopoNode[]): TopologyHostCommand {
  const { freeTextAnnotations, freeShapeAnnotations, trafficRateAnnotations, groups } =
    nodesToAnnotations(graphNodesForSave);
  const memberships = collectNodeGroupMemberships(graphNodesForSave);

  return {
    command: "setAnnotationsWithMemberships",
    payload: {
      annotations: {
        freeTextAnnotations,
        freeShapeAnnotations,
        trafficRateAnnotations,
        groupStyleAnnotations: groups
      },
      memberships: memberships.map((entry) => ({
        nodeId: entry.id,
        groupId: entry.groupId
      }))
    }
  };
}

function getInteractionMode(mode: "view" | "edit", isProcessing: boolean): "view" | "edit" {
  if (isProcessing) return "view";
  return mode;
}

function getInteractionLockState(isLocked: boolean, isProcessing: boolean): boolean {
  return isLocked || isProcessing;
}

function isDevMockWebview(): boolean {
  return window.vscode?.__isDevMock__ === true;
}

function isDevExplorerDisabledByUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const rawValue = params.get("devExplorer");
  if (rawValue == null || rawValue.length === 0) return false;
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off";
}

function shouldDumpCssVars(): boolean {
  const params = new URLSearchParams(window.location.search);
  const rawValue = params.get("dumpCssVars");
  if (rawValue == null || rawValue.length === 0) return false;
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

interface ContextSelectionState {
  selectedNode: unknown;
  selectedEdge: unknown;
  editingNode: unknown;
  editingEdge: unknown;
  editingNetwork: unknown;
  editingImpairment: unknown;
}

interface ContextAnnotationState {
  editingTextAnnotation: unknown;
  editingShapeAnnotation: unknown;
  editingTrafficRateAnnotation: unknown;
  editingGroup: unknown;
}

function hasContextContentState(
  state: ContextSelectionState,
  annotations: ContextAnnotationState
): boolean {
  const candidates = [
    state.selectedNode,
    state.selectedEdge,
    state.editingNode,
    state.editingEdge,
    state.editingNetwork,
    state.editingImpairment,
    annotations.editingTextAnnotation,
    annotations.editingShapeAnnotation,
    annotations.editingTrafficRateAnnotation,
    annotations.editingGroup
  ];
  return candidates.some((value) => value !== null && value !== undefined);
}

export interface AppContentProps {
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: LayoutControls;
  onInit: (instance: ReactFlowInstance) => void;
}

interface StoreSelectionState {
  selectedNode: string | null;
  selectedEdge: string | null;
  editingImpairment: string | null;
  editingNode: string | null;
  editingEdge: string | null;
  editingNetwork: string | null;
  endpointLabelOffset: number;
}

type CanvasPropsWithoutGraph = Omit<
  React.ComponentPropsWithoutRef<typeof ReactFlowCanvas>,
  "nodes" | "edges"
>;

interface GraphCanvasMainProps {
  canvasRef: React.RefObject<ReactFlowCanvasRef | null>;
  canvasProps: CanvasPropsWithoutGraph;
  showDummyLinks: boolean;
  edgeAnnotationLookup: EdgeAnnotationLookup;
  endpointLabelOffsetEnabled: boolean;
  endpointLabelOffset: number;
}

function areSelectedNodesEqual(left: TopoNode | null, right: TopoNode | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && left.data === right.data;
}

function areSelectedEdgesEqual(left: TopoEdge | null, right: TopoEdge | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.source === right.source &&
    left.target === right.target &&
    left.data === right.data
  );
}

function useGraphNodeById(nodeId: string | null): TopoNode | null {
  return useGraphStore(
    React.useCallback(
      (graphState) =>
        nodeId != null && nodeId.length > 0
          ? (graphState.nodes.find(
              (node): node is TopoNode => node.id === nodeId && isTopoNode(node)
            ) ?? null)
          : null,
      [nodeId]
    ),
    areSelectedNodesEqual
  );
}

function useGraphEdgeById(edgeId: string | null): TopoEdge | null {
  return useGraphStore(
    React.useCallback(
      (graphState) =>
        edgeId != null && edgeId.length > 0
          ? (graphState.edges.find(
              (edge): edge is TopoEdge => edge.id === edgeId && isTopoEdge(edge)
            ) ?? null)
          : null,
      [edgeId]
    ),
    areSelectedEdgesEqual
  );
}

function useStoreBackedSelectionData(
  state: StoreSelectionState,
  edgeAnnotationLookup: EdgeAnnotationLookup
) {
  const selectedNode = useGraphNodeById(state.selectedNode);
  const editingNode = useGraphNodeById(state.editingNode);
  const editingNetwork = useGraphNodeById(state.editingNetwork);
  const selectedEdge = useGraphEdgeById(state.selectedEdge);
  const editingImpairment = useGraphEdgeById(state.editingImpairment);
  const editingEdge = useGraphEdgeById(state.editingEdge);

  const selectionNodes = React.useMemo(() => {
    const deduped = new Map<string, TopoNode>();
    for (const node of [selectedNode, editingNode, editingNetwork]) {
      if (!node) continue;
      deduped.set(node.id, node);
    }
    return Array.from(deduped.values());
  }, [selectedNode, editingNode, editingNetwork]);

  const selectionEdges = React.useMemo(() => {
    const deduped = new Map<string, TopoEdge>();
    for (const edge of [selectedEdge, editingImpairment, editingEdge]) {
      if (!edge) continue;
      deduped.set(edge.id, edge);
    }
    return Array.from(deduped.values());
  }, [selectedEdge, editingImpairment, editingEdge]);

  return useSelectionData(state, selectionNodes, selectionEdges, edgeAnnotationLookup);
}

const GraphCanvasMain: React.FC<GraphCanvasMainProps> = React.memo(
  ({
    canvasRef,
    canvasProps,
    showDummyLinks,
    edgeAnnotationLookup,
    endpointLabelOffsetEnabled,
    endpointLabelOffset
  }) => {
    const { nodes, edges } = useGraphState();
    const graphNodes = React.useMemo(() => nodes.filter(isTopoNode), [nodes]);
    const graphEdges = React.useMemo(() => edges.filter(isTopoEdge), [edges]);
    useIconReconciliation();

    const { filteredNodes, filteredEdges } = useFilteredGraphElements(
      graphNodes,
      graphEdges,
      showDummyLinks
    );

    const renderedEdges = React.useMemo(() => {
      if (filteredEdges.length === 0) return filteredEdges;
      return filteredEdges.map((edge) => {
        const data = edge.data;
        if (data == null) return edge;
        const sourceEndpoint = data.sourceEndpoint;
        const targetEndpoint = data.targetEndpoint;
        const annotation = findEdgeAnnotationInLookup(edgeAnnotationLookup, {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceEndpoint,
          targetEndpoint
        });
        const annotationOffset = parseEndpointLabelOffset(annotation?.endpointLabelOffset);
        const annotationEnabled =
          annotation?.endpointLabelOffsetEnabled ??
          (annotation?.endpointLabelOffset !== undefined ? true : undefined);
        const enabled = annotationEnabled ?? endpointLabelOffsetEnabled;
        const resolvedOffset = enabled ? (annotationOffset ?? endpointLabelOffset) : 0;

        if (
          data.endpointLabelOffsetEnabled === enabled &&
          data.endpointLabelOffset === resolvedOffset
        ) {
          return edge;
        }

        return {
          ...edge,
          data: {
            ...data,
            endpointLabelOffsetEnabled: enabled,
            endpointLabelOffset: resolvedOffset
          }
        };
      });
    }, [filteredEdges, edgeAnnotationLookup, endpointLabelOffset, endpointLabelOffsetEnabled]);

    return (
      <ReactFlowCanvas
        ref={canvasRef}
        {...canvasProps}
        nodes={filteredNodes}
        edges={renderedEdges}
      />
    );
  }
);
GraphCanvasMain.displayName = "GraphCanvasMain";

interface AnnotationRuntimeBridgeProps {
  rfInstance: ReactFlowInstance | null;
  onLockedAction: () => void;
  runtimeRef: { current: AnnotationContextValue | null };
}

const AnnotationRuntimeBridge: React.FC<AnnotationRuntimeBridgeProps> = ({
  rfInstance,
  onLockedAction,
  runtimeRef
}) => {
  const annotations = useAnnotations({ rfInstance, onLockedAction });
  runtimeRef.current = annotations;

  React.useEffect(
    () => () => {
      runtimeRef.current = null;
    },
    [runtimeRef]
  );

  return null;
};

type SvgExportModalContainerProps = Pick<
  React.ComponentPropsWithoutRef<typeof SvgExportModal>,
  "onClose" | "rfInstance" | "customIcons" | "labName"
>;

const SvgExportModalContainer: React.FC<SvgExportModalContainerProps> = React.memo(
  ({ onClose, rfInstance, customIcons, labName }) => {
    const { textAnnotations, shapeAnnotations, groups } = useDerivedAnnotations();

    return (
      <SvgExportModal
        isOpen
        onClose={onClose}
        labName={labName}
        textAnnotations={textAnnotations}
        shapeAnnotations={shapeAnnotations}
        groups={groups}
        rfInstance={rfInstance}
        customIcons={customIcons}
      />
    );
  }
);
SvgExportModalContainer.displayName = "SvgExportModalContainer";

export const AppContent: React.FC<AppContentProps> = ({
  reactFlowRef,
  rfInstance,
  layoutControls,
  onInit
}) => {
  const state = useTopoViewerState();
  const topoActions = useTopoViewerActions();
  const graphActions = useGraphActions();
  const annotationUiActions = useAnnotationUIActions();
  const isProcessing = state.isProcessing;
  const isInteractionLocked = getInteractionLockState(state.isLocked, isProcessing);
  const interactionMode = getInteractionMode(state.mode, isProcessing);
  const isDevMock = React.useMemo(() => isDevMockWebview(), []);
  const showDevExplorer = React.useMemo(
    () => isDevMock && !isDevExplorerDisabledByUrl(),
    [isDevMock]
  );
  useDevMockTrafficStats(isDevMock && interactionMode === "view");
  const layoutRef = React.useRef<HTMLDivElement | null>(null);
  const [devExplorerWidth, setDevExplorerWidth] = React.useState(DEV_EXPLORER_DEFAULT_WIDTH);
  const [isDevExplorerDragging, setIsDevExplorerDragging] = React.useState(false);
  const isDevExplorerDraggingRef = React.useRef(false);

  const handleDevExplorerResizeStart = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!showDevExplorer) {
        return;
      }

      event.preventDefault();
      isDevExplorerDraggingRef.current = true;
      setIsDevExplorerDragging(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDevExplorerDraggingRef.current) {
          return;
        }
        const layoutLeft = layoutRef.current?.getBoundingClientRect().left ?? 0;
        const nextWidth = moveEvent.clientX - layoutLeft;
        const clampedWidth = Math.min(
          getDevExplorerMaxWidth(),
          Math.max(DEV_EXPLORER_MIN_WIDTH, nextWidth)
        );
        setDevExplorerWidth(clampedWidth);
      };

      const onMouseUp = () => {
        isDevExplorerDraggingRef.current = false;
        setIsDevExplorerDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [showDevExplorer]
  );

  React.useEffect(() => {
    if (!showDevExplorer) {
      return;
    }

    const handleWindowResize = () => {
      setDevExplorerWidth((currentWidth) =>
        Math.min(getDevExplorerMaxWidth(), Math.max(DEV_EXPLORER_MIN_WIDTH, currentWidth))
      );
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [showDevExplorer]);

  React.useEffect(() => {
    if (!shouldDumpCssVars()) return;
    const htmlStyle = document.querySelector("html")?.getAttribute("style");
    if (htmlStyle == null || htmlStyle.length === 0) return;
    const vars: Record<string, string> = {};
    for (const part of htmlStyle.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith("--vscode-")) continue;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;
      vars[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
    }
    if (Object.keys(vars).length === 0) return;
    const sorted = Object.fromEntries(Object.entries(vars).sort(([a], [b]) => a.localeCompare(b)));
    window.vscode?.postMessage({ command: "dump-css-vars", vars: sorted });
  }, []);

  const undoRedo = useUndoRedoControls(state.canUndo, state.canRedo);
  const { trigger: triggerLockShake } = useShakeAnimation();

  const { toasts, dismissToast, addToast } = useAppToasts({
    customNodeError: state.customNodeError,
    clearCustomNodeError: topoActions.clearCustomNodeError
  });

  const handleLockedAction = React.useCallback(() => {
    triggerLockShake();
    addToast("Lab is locked (read-only)", "error", 2000);
  }, [triggerLockShake, addToast]);

  const annotationRuntimeRef = React.useRef<AnnotationContextValue | null>(null);
  const annotationUiState = useAnnotationUIState();

  const annotationMode = React.useMemo(
    () => ({
      isAddTextMode: annotationUiState.isAddTextMode,
      isAddShapeMode: annotationUiState.isAddShapeMode,
      pendingShapeType: annotationUiState.isAddShapeMode
        ? annotationUiState.pendingShapeType
        : undefined
    }),
    [
      annotationUiState.isAddTextMode,
      annotationUiState.isAddShapeMode,
      annotationUiState.pendingShapeType
    ]
  );

  const annotationActions = React.useMemo(
    () => ({
      handleAddGroup: () => {
        annotationRuntimeRef.current?.handleAddGroup();
      },
      handleAddText: () => {
        annotationRuntimeRef.current?.handleAddText();
      },
      handleAddShapes: (shapeType?: string) => {
        annotationRuntimeRef.current?.handleAddShapes(shapeType);
      },
      createTextAtPosition: (position: { x: number; y: number }) => {
        annotationRuntimeRef.current?.createTextAtPosition(position);
      },
      createGroupAtPosition: (position: { x: number; y: number }) => {
        annotationRuntimeRef.current?.createGroupAtPosition(position);
      },
      createShapeAtPosition: (position: { x: number; y: number }, shapeType?: string) => {
        annotationRuntimeRef.current?.createShapeAtPosition(position, shapeType);
      },
      createTrafficRateAtPosition: (position: { x: number; y: number }) => {
        annotationRuntimeRef.current?.createTrafficRateAtPosition(position);
      },
      getNodeMembership: (nodeId: string) =>
        annotationRuntimeRef.current?.getNodeMembership(nodeId) ?? null,
      addNodeToGroup: (nodeId: string, groupId: string) => {
        annotationRuntimeRef.current?.addNodeToGroup(nodeId, groupId);
      },
      deleteAllSelected: () => {
        annotationRuntimeRef.current?.deleteAllSelected();
      },
      deleteSelectedForBatch: (
        options?: Parameters<AnnotationContextValue["deleteSelectedForBatch"]>[0]
      ) =>
        annotationRuntimeRef.current?.deleteSelectedForBatch(options) ?? {
          didDelete: false,
          membersCleared: false
        },
      saveTextAnnotation: (...args: Parameters<AnnotationContextValue["saveTextAnnotation"]>) => {
        annotationRuntimeRef.current?.saveTextAnnotation(...args);
      },
      updateTextAnnotation: (
        ...args: Parameters<AnnotationContextValue["updateTextAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.updateTextAnnotation(...args);
      },
      previewTextAnnotation: (
        ...args: Parameters<AnnotationContextValue["previewTextAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.previewTextAnnotation(...args);
      },
      removePreviewTextAnnotation: (
        ...args: Parameters<AnnotationContextValue["removePreviewTextAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.removePreviewTextAnnotation(...args);
      },
      deleteTextAnnotation: (
        ...args: Parameters<AnnotationContextValue["deleteTextAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.deleteTextAnnotation(...args);
      },
      saveShapeAnnotation: (...args: Parameters<AnnotationContextValue["saveShapeAnnotation"]>) => {
        annotationRuntimeRef.current?.saveShapeAnnotation(...args);
      },
      updateShapeAnnotation: (
        ...args: Parameters<AnnotationContextValue["updateShapeAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.updateShapeAnnotation(...args);
      },
      previewShapeAnnotation: (
        ...args: Parameters<AnnotationContextValue["previewShapeAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.previewShapeAnnotation(...args);
      },
      removePreviewShapeAnnotation: (
        ...args: Parameters<AnnotationContextValue["removePreviewShapeAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.removePreviewShapeAnnotation(...args);
      },
      deleteShapeAnnotation: (
        ...args: Parameters<AnnotationContextValue["deleteShapeAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.deleteShapeAnnotation(...args);
      },
      saveTrafficRateAnnotation: (
        ...args: Parameters<AnnotationContextValue["saveTrafficRateAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.saveTrafficRateAnnotation(...args);
      },
      updateTrafficRateAnnotation: (
        ...args: Parameters<AnnotationContextValue["updateTrafficRateAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.updateTrafficRateAnnotation(...args);
      },
      deleteTrafficRateAnnotation: (
        ...args: Parameters<AnnotationContextValue["deleteTrafficRateAnnotation"]>
      ) => {
        annotationRuntimeRef.current?.deleteTrafficRateAnnotation(...args);
      },
      saveGroup: (...args: Parameters<AnnotationContextValue["saveGroup"]>) => {
        annotationRuntimeRef.current?.saveGroup(...args);
      },
      deleteGroup: (...args: Parameters<AnnotationContextValue["deleteGroup"]>) => {
        annotationRuntimeRef.current?.deleteGroup(...args);
      },
      updateGroup: (...args: Parameters<AnnotationContextValue["updateGroup"]>) => {
        annotationRuntimeRef.current?.updateGroup(...args);
      }
    }),
    []
  );

  const canvasAnnotationHandlers = React.useMemo<
    NonNullable<CanvasPropsWithoutGraph["annotationHandlers"]>
  >(
    () => ({
      onAddTextClick: (position) => {
        annotationRuntimeRef.current?.handleTextCanvasClick(position);
      },
      onAddShapeClick: (position) => {
        annotationRuntimeRef.current?.handleShapeCanvasClick(position);
      },
      disableAddTextMode: () => {
        annotationRuntimeRef.current?.disableAddTextMode();
      },
      disableAddShapeMode: () => {
        annotationRuntimeRef.current?.disableAddShapeMode();
      },
      onEditFreeText: (id) => {
        annotationRuntimeRef.current?.editTextAnnotation(id);
      },
      onEditFreeShape: (id) => {
        annotationRuntimeRef.current?.editShapeAnnotation(id);
      },
      onEditTrafficRate: (id) => {
        annotationRuntimeRef.current?.editTrafficRateAnnotation(id);
      },
      onDeleteFreeText: (id) => {
        annotationRuntimeRef.current?.deleteTextAnnotation(id);
      },
      onDeleteFreeShape: (id) => {
        annotationRuntimeRef.current?.deleteShapeAnnotation(id);
      },
      onDeleteTrafficRate: (id) => {
        annotationRuntimeRef.current?.deleteTrafficRateAnnotation(id);
      },
      onUpdateFreeTextSize: (id, width, height) => {
        annotationRuntimeRef.current?.updateTextSize(id, width, height);
      },
      onUpdateFreeShapeSize: (id, width, height) => {
        annotationRuntimeRef.current?.updateShapeSize(id, width, height);
      },
      onUpdateTrafficRateSize: (id, width, height) => {
        annotationRuntimeRef.current?.updateTrafficRateSize(id, width, height);
      },
      onUpdateFreeTextRotation: (id, rotation) => {
        annotationRuntimeRef.current?.updateTextRotation(id, rotation);
      },
      onUpdateFreeShapeRotation: (id, rotation) => {
        annotationRuntimeRef.current?.updateShapeRotation(id, rotation);
      },
      onFreeTextRotationStart: (id) => {
        annotationRuntimeRef.current?.onTextRotationStart(id);
      },
      onFreeTextRotationEnd: (id) => {
        annotationRuntimeRef.current?.onTextRotationEnd(id);
      },
      onFreeShapeRotationStart: (id) => {
        annotationRuntimeRef.current?.onShapeRotationStart(id);
      },
      onFreeShapeRotationEnd: (id) => {
        annotationRuntimeRef.current?.onShapeRotationEnd(id);
      },
      onUpdateFreeShapeStartPosition: (id, startPosition) => {
        annotationRuntimeRef.current?.updateShapeStartPosition(id, startPosition);
      },
      onUpdateFreeShapeEndPosition: (id, endPosition) => {
        annotationRuntimeRef.current?.updateShapeEndPosition(id, endPosition);
      },
      onPersistAnnotations: () => {
        annotationRuntimeRef.current?.persistAnnotations();
      },
      onNodeDropped: (nodeId, position) => {
        annotationRuntimeRef.current?.onNodeDropped(nodeId, position);
      },
      onUpdateGroupSize: (id, width, height) => {
        annotationRuntimeRef.current?.updateGroupSize(id, width, height);
      },
      onEditGroup: (id) => {
        annotationRuntimeRef.current?.editGroup(id);
      },
      onDeleteGroup: (id) => {
        annotationRuntimeRef.current?.deleteGroup(id);
      },
      getGroupMembers: (groupId, options) =>
        annotationRuntimeRef.current?.getGroupMembers(groupId, options) ?? []
    }),
    []
  );

  const getAnnotationGroups = React.useCallback(
    () => annotationRuntimeRef.current?.groups ?? [],
    []
  );

  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );
  const selectionData = useStoreBackedSelectionData(
    {
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge,
      editingImpairment: state.editingImpairment,
      editingNode: state.editingNode,
      editingEdge: state.editingEdge,
      editingNetwork: state.editingNetwork,
      endpointLabelOffset: state.endpointLabelOffset
    },
    edgeAnnotationLookup
  );

  const [paletteTabRequest, setPaletteTabRequest] = React.useState<{ tabId: string } | undefined>(
    undefined
  );
  const customNodeCommands = useCustomNodeCommands(
    state.customNodes,
    topoActions.editCustomTemplate
  );

  const menuHandlers = useContextMenuHandlers({
    selectNode: topoActions.selectNode,
    selectEdge: topoActions.selectEdge,
    editNode: topoActions.editNode,
    editEdge: topoActions.editEdge,
    editNetwork: topoActions.editNetwork,
    onDeleteNode: topoActions.clearSelectionForDeletedNode,
    onDeleteEdge: topoActions.clearSelectionForDeletedEdge
  });

  const graphHandlers = useAppGraphHandlers({
    rfInstance,
    menuHandlers,
    actions: {
      addNode: graphActions.addNode,
      addEdge: graphActions.addEdge,
      removeNodeAndEdges: graphActions.removeNodeAndEdges,
      removeEdge: graphActions.removeEdge,
      updateNodeData: graphActions.updateNodeData,
      updateEdge: graphActions.updateEdge,
      renameNode: graphActions.renameNode
    }
  });

  const updateEdgeNetemData = React.useCallback(
    (data: LinkImpairmentData) => {
      const { edges } = useGraphStore.getState();
      const edge = edges.find((item) => item.id === data.id);
      if (!edge) return;
      const edgeData = edge.data;
      const extraData = toRecord(edgeData?.extraData);
      const currentSourceNetem = toNetemState(extraData.clabSourceNetem);
      const currentTargetNetem = toNetemState(extraData.clabTargetNetem);
      const hasNetemChanges =
        !areNetemEquivalent(currentSourceNetem, data.sourceNetem) ||
        !areNetemEquivalent(currentTargetNetem, data.targetNetem);
      const nextExtraData: Record<string, unknown> = {
        ...extraData,
        clabSourceNetem: data.sourceNetem,
        clabTargetNetem: data.targetNetem
      };
      if (hasNetemChanges) {
        nextExtraData[PENDING_NETEM_KEY] = createPendingNetemOverride(
          data.sourceNetem,
          data.targetNetem
        );
      }
      graphActions.updateEdgeData(data.id, {
        extraData: nextExtraData
      });
    },
    [graphActions]
  );

  const handleLinkImpairmentSave = React.useCallback(
    (data: LinkImpairmentData) => {
      updateEdgeNetemData(data);
      topoActions.editImpairment(null);
    },
    [topoActions, updateEdgeNetemData]
  );

  const handleLinkImpairmentApply = React.useCallback(
    (data: LinkImpairmentData) => {
      updateEdgeNetemData(data);
    },
    [updateEdgeNetemData]
  );

  const handleLinkImpairmentError = React.useCallback(
    (error: string) => {
      addToast(error, "error");
    },
    [addToast]
  );

  const { nodeEditorHandlers, linkEditorHandlers, networkEditorHandlers } = useAppEditorBindings({
    selectionData,
    state: {
      edgeAnnotations: state.edgeAnnotations
    },
    actions: {
      editNode: topoActions.editNode,
      editEdge: topoActions.editEdge,
      editNetwork: topoActions.editNetwork,
      setEdgeAnnotations: topoActions.setEdgeAnnotations,
      refreshEditorData: topoActions.refreshEditorData
    },
    renameNodeInGraph: graphHandlers.renameNodeInGraph,
    handleUpdateNodeData: graphHandlers.handleUpdateNodeData,
    handleUpdateEdgeData: graphHandlers.handleUpdateEdgeData
  });

  const getGraphNodes = React.useCallback(
    () => useGraphStore.getState().nodes.filter(isTopoNode),
    []
  );

  const graphCreation = useGraphCreation({
    rfInstance,
    onLockedAction: handleLockedAction,
    state: {
      mode: interactionMode,
      isLocked: isInteractionLocked,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      getNodes: getGraphNodes
    },
    onEdgeCreated: graphHandlers.handleEdgeCreated,
    onNodeCreated: graphHandlers.handleNodeCreatedCallback,
    addNode: graphHandlers.addNodeDirect,
    onNewCustomNode: customNodeCommands.onNewCustomNode
  });

  // Drag-drop handlers for node palette
  const handleDropCreateNode = React.useCallback(
    (position: { x: number; y: number }, templateName: string) => {
      if (isInteractionLocked) {
        handleLockedAction();
        return;
      }
      // Find the template by name
      const template = state.customNodes.find((t) => t.name === templateName);
      if (template) {
        graphCreation.createNodeAtPosition(position, template);
      }
    },
    [isInteractionLocked, state.customNodes, graphCreation, handleLockedAction]
  );

  const handleDropCreateNetwork = React.useCallback(
    (position: { x: number; y: number }, networkType: string) => {
      if (isInteractionLocked) {
        handleLockedAction();
        return;
      }
      if (!isNetworkTypeValue(networkType)) return;
      graphCreation.createNetworkAtPosition(position, networkType);
    },
    [isInteractionLocked, graphCreation, handleLockedAction]
  );

  useAppE2EExposure({
    state: {
      isLocked: isInteractionLocked,
      mode: interactionMode,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge
    },
    actions: {
      toggleLock: topoActions.toggleLock,
      setMode: topoActions.setMode,
      editNode: topoActions.editNode,
      editNetwork: topoActions.editNetwork,
      selectNode: topoActions.selectNode,
      selectEdge: topoActions.selectEdge
    },
    undoRedo,
    graphHandlers,
    annotations: {
      handleAddGroup: annotationActions.handleAddGroup,
      getGroups: getAnnotationGroups
    },
    graphCreation,
    layoutControls,
    rfInstance
  });

  const { handleDeselectAll } = useAppHandlers({
    selectionCallbacks: {
      selectNode: topoActions.selectNode,
      selectEdge: topoActions.selectEdge,
      editNode: topoActions.editNode,
      editEdge: topoActions.editEdge
    },
    rfInstance
  });

  const shortcutDisplay = useShortcutDisplay();
  const panelVisibility = usePanelVisibility();

  const clearAllEditingState = React.useCallback(() => {
    topoActions.editNode(null);
    topoActions.editEdge(null);
    topoActions.editImpairment(null);
    topoActions.editNetwork(null);
    topoActions.selectNode(null);
    topoActions.selectEdge(null);
    annotationUiActions.closeTextEditor();
    annotationUiActions.closeShapeEditor();
    annotationUiActions.closeTrafficRateEditor();
    annotationUiActions.closeGroupEditor();
  }, [topoActions, annotationUiActions]);

  const hasContextContent = hasContextContentState(state, annotationUiState);

  const handleEmptyCanvasClick = React.useCallback(() => {
    // When dismissing any context (editors/info) via empty canvas click, close the context panel
    // instead of falling back to the Nodes/Annotations palette view.
    // Exception: if the user opened the panel manually, keep it open until they close it.
    const shouldClosePanel =
      panelVisibility.isContextPanelOpen &&
      panelVisibility.contextPanelOpenReason !== "manual" &&
      hasContextContent;

    clearAllEditingState();

    if (shouldClosePanel) {
      panelVisibility.handleCloseContextPanel();
    }
  }, [clearAllEditingState, hasContextContent, panelVisibility]);

  const processingRef = React.useRef(false);
  React.useEffect(() => {
    if (isProcessing) {
      if (processingRef.current) return;
      processingRef.current = true;
      clearAllEditingState();
      annotationUiActions.disableAddTextMode();
      annotationUiActions.disableAddShapeMode();
      annotationUiActions.clearAllSelections();
      panelVisibility.handleCloseBulkLink();
      panelVisibility.handleCloseLabSettings();
      return;
    }
    processingRef.current = false;
  }, [annotationUiActions, clearAllEditingState, isProcessing, panelVisibility]);

  const clipboardHandlers = useClipboardHandlers({
    annotations: {
      getNodeMembership: annotationActions.getNodeMembership,
      addNodeToGroup: annotationActions.addNodeToGroup,
      deleteAllSelected: annotationActions.deleteAllSelected
    },
    rfInstance,
    handleNodeCreatedCallback: graphHandlers.handleNodeCreatedCallback,
    handleEdgeCreated: graphHandlers.handleEdgeCreated,
    handleBatchPaste: graphHandlers.handleBatchPaste
  });

  const handleDeleteSelection = React.useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = useGraphStore.getState();
    const { nodeIds, edgeIds } = collectSelectedIds(
      currentNodes,
      currentEdges,
      state.selectedNode,
      state.selectedEdge
    );
    if (nodeIds.size === 0 && edgeIds.size === 0) return;

    const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
    const edgesById = new Map(currentEdges.filter(isTopoEdge).map((edge) => [edge.id, edge]));

    const { graphNodeIds, groupIds, textIds, shapeIds, trafficRateIds } = splitNodeIdsByType(
      nodeIds,
      nodesById
    );

    applyGraphDeletions(graphActions, menuHandlers, graphNodeIds, edgeIds);

    const annotationResult = annotationActions.deleteSelectedForBatch({
      groupIds,
      textIds,
      shapeIds,
      trafficRateIds
    });

    const commands = buildDeleteCommands(graphNodeIds, edgeIds, edgesById);

    if (annotationResult.didDelete || annotationResult.membersCleared) {
      const graphNodesForSave = useGraphStore.getState().nodes.filter(isTopoNode);
      commands.push(buildAnnotationSaveCommand(graphNodesForSave));
    }

    if (commands.length === 0) return;

    executeTopologyCommand(
      { command: "batch", payload: { commands } },
      { applySnapshot: false }
    ).catch((err) => {
      console.error("[TopoViewer] Failed to batch delete", err);
    });
  }, [annotationActions, graphActions, menuHandlers, state.selectedNode, state.selectedEdge]);

  useAppKeyboardShortcuts({
    state: {
      mode: interactionMode,
      isLocked: isInteractionLocked,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge
    },
    undoRedo,
    annotations: {
      selectedTextIds: annotationUiState.selectedTextIds,
      selectedShapeIds: annotationUiState.selectedShapeIds,
      selectedTrafficRateIds: annotationUiState.selectedTrafficRateIds,
      selectedGroupIds: annotationUiState.selectedGroupIds,
      clearAllSelections: annotationUiActions.clearAllSelections,
      handleAddGroup: annotationActions.handleAddGroup
    },
    clipboardHandlers,
    deleteHandlers: {
      handleDeleteNode: graphHandlers.handleDeleteNode,
      handleDeleteLink: graphHandlers.handleDeleteLink,
      handleDeleteSelection
    },
    handleDeselectAll
  });

  const easterEgg = useEasterEgg({});

  // Auto-open context panel when selection/editing state changes
  React.useEffect(() => {
    if (hasContextContent && !isProcessing && !panelVisibility.isContextPanelOpen) {
      panelVisibility.handleOpenContextPanel("auto");
    }
  }, [hasContextContent, isProcessing, panelVisibility]);

  // close if palette wasn't open, else go back to palette
  const handleContextPanelBack = React.useCallback(() => {
    const shouldClose = panelVisibility.contextPanelOpenReason === "auto";
    clearAllEditingState();
    if (shouldClose) {
      panelVisibility.handleCloseContextPanel();
    }
  }, [clearAllEditingState, panelVisibility]);

  const handleZoomToFit = React.useCallback(() => {
    if (reactFlowRef.current) {
      reactFlowRef.current.fit();
      return;
    }
    rfInstance?.fitView({ padding: 0.1 }).catch(() => {
      /* ignore */
    });
  }, [reactFlowRef, rfInstance]);

  const handleOpenNodePalette = React.useCallback(() => {
    handleContextPanelBack();
    panelVisibility.handleOpenContextPanel();
  }, [handleContextPanelBack, panelVisibility]);

  const canvasProps = React.useMemo<CanvasPropsWithoutGraph>(
    () => ({
      isContextPanelOpen: panelVisibility.isContextPanelOpen,
      onPaneClick: handleEmptyCanvasClick,
      layout: layoutControls.layout,
      isGeoLayout: layoutControls.isGeoLayout,
      gridLineWidth: layoutControls.gridLineWidth,
      gridStyle: layoutControls.gridStyle,
      gridColor: layoutControls.gridColor,
      gridBgColor: layoutControls.gridBgColor,
      annotationMode,
      annotationHandlers: canvasAnnotationHandlers,
      linkLabelMode: state.linkLabelMode,
      onInit,
      onEdgeCreated: graphHandlers.handleEdgeCreated,
      onShiftClickCreate: graphCreation.createNodeAtPosition,
      onNodeDelete: graphHandlers.handleDeleteNode,
      onEdgeDelete: graphHandlers.handleDeleteLink,
      onOpenNodePalette: handleOpenNodePalette,
      onAddGroup: annotationActions.handleAddGroup,
      onAddText: annotationActions.handleAddText,
      onAddShapes: annotationActions.handleAddShapes,
      onAddTextAtPosition: annotationActions.createTextAtPosition,
      onAddGroupAtPosition: annotationActions.createGroupAtPosition,
      onAddShapeAtPosition: annotationActions.createShapeAtPosition,
      onAddTrafficRateAtPosition: annotationActions.createTrafficRateAtPosition,
      onDropCreateNode: handleDropCreateNode,
      onDropCreateNetwork: handleDropCreateNetwork,
      onLockedAction: handleLockedAction
    }),
    [
      panelVisibility.isContextPanelOpen,
      handleEmptyCanvasClick,
      layoutControls.layout,
      layoutControls.isGeoLayout,
      layoutControls.gridLineWidth,
      layoutControls.gridStyle,
      layoutControls.gridColor,
      layoutControls.gridBgColor,
      annotationMode,
      canvasAnnotationHandlers,
      state.linkLabelMode,
      onInit,
      graphHandlers.handleEdgeCreated,
      graphCreation.createNodeAtPosition,
      graphHandlers.handleDeleteNode,
      graphHandlers.handleDeleteLink,
      handleOpenNodePalette,
      annotationActions,
      handleDropCreateNode,
      handleDropCreateNetwork,
      handleLockedAction
    ]
  );

  const handleNetworkSave = React.useCallback(
    (data: Parameters<typeof networkEditorHandlers.handleSave>[0]) => {
      networkEditorHandlers.handleSave(data).catch((err) => {
        console.error("[TopoViewer] Network editor save failed", err);
      });
    },
    [networkEditorHandlers]
  );

  const handleNetworkApply = React.useCallback(
    (data: Parameters<typeof networkEditorHandlers.handleApply>[0]) => {
      networkEditorHandlers.handleApply(data).catch((err) => {
        console.error("[TopoViewer] Network editor apply failed", err);
      });
    },
    [networkEditorHandlers]
  );

  const handleCloseLifecycleModal = React.useCallback(() => {
    topoActions.closeLifecycleModal();
  }, [topoActions]);

  const handleCancelLifecycle = React.useCallback(() => {
    sendCancelLabLifecycle();
  }, []);

  const handleToggleSplit = React.useCallback(() => {
    panelVisibility.handleOpenContextPanel("manual");
    setPaletteTabRequest({ tabId: "yaml" });
  }, [panelVisibility]);

  return (
    <MuiThemeProvider>
      <Box
        data-testid="topoviewer-app"
        display="flex"
        flexDirection="column"
        height="100%"
        width="100%"
        overflow="hidden"
      >
        <AnnotationRuntimeBridge
          rfInstance={rfInstance}
          onLockedAction={handleLockedAction}
          runtimeRef={annotationRuntimeRef}
        />
        <Navbar
          onZoomToFit={handleZoomToFit}
          layout={layoutControls.layout}
          onLayoutChange={layoutControls.setLayout}
          onLabSettings={panelVisibility.handleShowLabSettings}
          onToggleSplit={handleToggleSplit}
          onFindNode={panelVisibility.handleOpenFindPopover}
          onCaptureViewport={panelVisibility.handleShowSvgExport}
          onShowShortcuts={panelVisibility.handleShowShortcuts}
          onShowAbout={panelVisibility.handleShowAbout}
          onShowBulkLink={panelVisibility.handleShowBulkLink}
          onShowGridSettings={panelVisibility.handleOpenGridPopover}
          linkLabelMode={state.linkLabelMode}
          onLinkLabelModeChange={topoActions.setLinkLabelMode}
          shortcutDisplayEnabled={shortcutDisplay.isEnabled}
          onToggleShortcutDisplay={shortcutDisplay.toggle}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          onUndo={undoRedo.undo}
          onRedo={undoRedo.redo}
          onLogoClick={easterEgg.handleLogoClick}
          logoClickProgress={easterEgg.state.progress}
          isPartyMode={easterEgg.state.isPartyMode}
        />
        <Box
          ref={layoutRef}
          sx={{ display: "flex", flexGrow: 1, overflow: "hidden", position: "relative" }}
        >
          {showDevExplorer && (
            <Box
              sx={{
                position: "relative",
                width: devExplorerWidth,
                minWidth: DEV_EXPLORER_MIN_WIDTH,
                maxWidth: getDevExplorerMaxWidth(),
                flexShrink: 0,
                borderRight: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                overflow: "hidden"
              }}
            >
              <ContainerlabExplorerView />
              <Box
                onMouseDown={handleDevExplorerResizeStart}
                sx={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  cursor: "col-resize",
                  zIndex: 2,
                  "&:hover": { bgcolor: "primary.main", opacity: 0.3 },
                  ...(isDevExplorerDragging
                    ? {
                        bgcolor: "primary.main",
                        opacity: 0.28
                      }
                    : {})
                }}
              />
            </Box>
          )}
          <ContextPanel
            isOpen={panelVisibility.isContextPanelOpen}
            side={panelVisibility.panelSide}
            onOpen={panelVisibility.handleOpenContextPanel}
            onClose={panelVisibility.handleCloseContextPanel}
            onBack={handleContextPanelBack}
            onToggleSide={panelVisibility.handleTogglePanelSide}
            rfInstance={rfInstance}
            palette={{
              mode: state.mode,
              requestedTab: paletteTabRequest,

              onEditCustomNode: customNodeCommands.onEditCustomNode,
              onDeleteCustomNode: customNodeCommands.onDeleteCustomNode,
              onSetDefaultCustomNode: customNodeCommands.onSetDefaultCustomNode
            }}
            view={{
              selectedNodeData: selectionData.selectedNodeData,
              selectedLinkData: selectionData.selectedLinkData
            }}
            editor={{
              editingNodeData: selectionData.editingNodeData,
              editingNodeInheritedProps: selectionData.editingNodeInheritedProps,
              nodeEditorHandlers: {
                handleClose: nodeEditorHandlers.handleClose,
                handleSave: nodeEditorHandlers.handleSave,
                handleApply: nodeEditorHandlers.handleApply,
                previewVisuals: nodeEditorHandlers.previewVisuals,
                handleDelete: selectionData.editingNodeData
                  ? () => graphHandlers.handleDeleteNode(selectionData.editingNodeData!.id)
                  : undefined
              },
              editingLinkData: selectionData.editingLinkData,
              linkEditorHandlers: {
                handleClose: linkEditorHandlers.handleClose,
                handleSave: linkEditorHandlers.handleSave,
                handleApply: linkEditorHandlers.handleApply,
                previewOffset: linkEditorHandlers.previewOffset,
                revertOffset: linkEditorHandlers.revertOffset,
                handleDelete: selectionData.editingLinkData
                  ? () => graphHandlers.handleDeleteLink(selectionData.editingLinkData!.id)
                  : undefined
              },
              editingNetworkData: selectionData.editingNetworkData,
              networkEditorHandlers: {
                handleClose: networkEditorHandlers.handleClose,
                handleSave: handleNetworkSave,
                handleApply: handleNetworkApply
              },
              linkImpairmentData: selectionData.selectedLinkImpairmentData,
              linkImpairmentHandlers: {
                onError: handleLinkImpairmentError,
                onApply: handleLinkImpairmentApply,
                onSave: handleLinkImpairmentSave,
                onClose: () => topoActions.editImpairment(null)
              },
              editingTextAnnotation: annotationUiState.editingTextAnnotation,
              textAnnotationHandlers: {
                onSave: annotationActions.saveTextAnnotation,
                onPreview: (annotation) => {
                  const exists =
                    annotationRuntimeRef.current?.textAnnotations.some(
                      (entry) => entry.id === annotation.id
                    ) ?? false;
                  if (exists) {
                    annotationActions.updateTextAnnotation(annotation.id, annotation);
                    return true;
                  }
                  annotationActions.previewTextAnnotation(annotation);
                  return false;
                },
                onPreviewDelete: annotationActions.removePreviewTextAnnotation,
                onClose: annotationUiActions.closeTextEditor,
                onDelete: annotationActions.deleteTextAnnotation
              },
              editingShapeAnnotation: annotationUiState.editingShapeAnnotation,
              shapeAnnotationHandlers: {
                onSave: annotationActions.saveShapeAnnotation,
                onPreview: (annotation) => {
                  const exists =
                    annotationRuntimeRef.current?.shapeAnnotations.some(
                      (entry) => entry.id === annotation.id
                    ) ?? false;
                  if (exists) {
                    annotationActions.updateShapeAnnotation(annotation.id, annotation);
                    return true;
                  }
                  annotationActions.previewShapeAnnotation(annotation);
                  return false;
                },
                onPreviewDelete: annotationActions.removePreviewShapeAnnotation,
                onClose: annotationUiActions.closeShapeEditor,
                onDelete: annotationActions.deleteShapeAnnotation
              },
              editingTrafficRateAnnotation: annotationUiState.editingTrafficRateAnnotation,
              trafficRateAnnotationHandlers: {
                onSave: annotationActions.saveTrafficRateAnnotation,
                onPreview: (annotation) => {
                  annotationActions.updateTrafficRateAnnotation(annotation.id, annotation);
                },
                onClose: annotationUiActions.closeTrafficRateEditor,
                onDelete: annotationActions.deleteTrafficRateAnnotation
              },
              editingGroup: annotationUiState.editingGroup,
              groupHandlers: {
                onSave: annotationActions.saveGroup,
                onClose: annotationUiActions.closeGroupEditor,
                onDelete: annotationActions.deleteGroup,
                onStylePreview: annotationActions.updateGroup
              }
            }}
          />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              overflow: "hidden",
              position: "relative"
            }}
          >
            <GraphCanvasMain
              canvasRef={reactFlowRef}
              canvasProps={canvasProps}
              showDummyLinks={state.showDummyLinks}
              edgeAnnotationLookup={edgeAnnotationLookup}
              endpointLabelOffset={state.endpointLabelOffset}
              endpointLabelOffsetEnabled={state.endpointLabelOffsetEnabled}
            />
            <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
            <EasterEggRenderer easterEgg={easterEgg} />
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
          </Box>
        </Box>

        {/* Modals */}
        <LifecycleProgressModal
          isOpen={state.lifecycleModalOpen}
          isProcessing={isProcessing}
          mode={state.processingMode}
          status={state.lifecycleStatus}
          statusMessage={state.lifecycleStatusMessage}
          labName={state.labName}
          logs={state.lifecycleLogs}
          onClose={handleCloseLifecycleModal}
          onCancel={handleCancelLifecycle}
        />
        <LabSettingsModal
          isOpen={panelVisibility.showLabSettingsModal}
          onClose={panelVisibility.handleCloseLabSettings}
          mode={state.mode}
          isLocked={isInteractionLocked}
          labSettings={state.labSettings ?? { name: state.labName }}
        />
        <ShortcutsModal
          isOpen={panelVisibility.showShortcutsModal}
          onClose={panelVisibility.handleCloseShortcuts}
        />
        {panelVisibility.showSvgExportModal ? (
          <SvgExportModalContainer
            onClose={panelVisibility.handleCloseSvgExport}
            rfInstance={rfInstance}
            labName={state.labName}
            customIcons={getCustomIconMap(state.customIcons)}
          />
        ) : null}
        <BulkLinkModal
          isOpen={panelVisibility.showBulkLinkModal && !isProcessing}
          mode={interactionMode}
          isLocked={isInteractionLocked}
          onClose={panelVisibility.handleCloseBulkLink}
        />
        <AboutModal
          isOpen={panelVisibility.showAboutPanel}
          onClose={panelVisibility.handleCloseAbout}
        />

        {/* Popovers */}
        <GridSettingsPopover
          anchorPosition={panelVisibility.gridPopoverPosition}
          onClose={panelVisibility.handleCloseGridPopover}
          gridLineWidth={layoutControls.gridLineWidth}
          onGridLineWidthChange={layoutControls.setGridLineWidth}
          gridStyle={layoutControls.gridStyle}
          onGridStyleChange={layoutControls.setGridStyle}
          gridColor={layoutControls.gridColor}
          onGridColorChange={layoutControls.setGridColor}
          gridBgColor={layoutControls.gridBgColor}
          onGridBgColorChange={layoutControls.setGridBgColor}
          onResetColors={layoutControls.resetGridColors}
        />
        <FindNodePopover
          anchorPosition={panelVisibility.findPopoverPosition}
          onClose={panelVisibility.handleCloseFindPopover}
          rfInstance={rfInstance}
        />
      </Box>
    </MuiThemeProvider>
  );
};
