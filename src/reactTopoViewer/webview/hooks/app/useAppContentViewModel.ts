/**
 * AppContent view-model hook - consolidates AppContent logic into focused helpers.
 */
/* eslint-disable import-x/max-dependencies */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { TopoEdge, TopoNode } from "../../../shared/types/graph";
import type { LinkEditorData } from "../../../shared/types/editors";
import type { FloatingActionPanelHandle } from "../../components/panels/floatingPanel/FloatingActionPanel";
import type { useLayoutControls } from "../ui";
import { useTopoViewerActions, useTopoViewerState } from "../../stores/topoViewerStore";
import { useGraphActions, useGraphState } from "../../stores/graphStore";
import { useAnnotations } from "../canvas";
import { useToasts } from "../../components/ui/Toast";
import { useEasterEgg } from "../../easter-eggs";
import { useGraphHandlersWithContext } from "../state";
import {
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers,
  useContextMenuHandlers
} from "../ui";
import {
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  useCustomTemplateEditor
} from "../editor";
import { buildEdgeAnnotationLookup } from "../../utils/edgeAnnotations";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import { executeTopologyCommand, saveEdgeAnnotations } from "../../services";

import { useCustomNodeCommands, useNavbarCommands, useE2ETestingExposure } from "./useAppHelpers";
import { useClipboardHandlers } from "./useClipboardHandlers";
import { useAppKeyboardShortcuts } from "./useAppKeyboardShortcuts";
import { useGraphCreation } from "./useGraphCreation";
import {
  useAnnotationCanvasHandlers,
  useCustomNodeErrorToast,
  useFilteredGraphElements,
  useSelectionData
} from "./useAppContentViewModel.helpers";

type LayoutControls = ReturnType<typeof useLayoutControls>;

interface UseAppContentViewModelParams {
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: LayoutControls;
  onLockedAction?: () => void;
}

export function useAppContentViewModel({
  floatingPanelRef,
  rfInstance,
  layoutControls,
  onLockedAction
}: UseAppContentViewModelParams) {
  const state = useTopoViewerState();
  const {
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork,
    editCustomTemplate,
    setEdgeAnnotations,
    toggleLock,
    refreshEditorData,
    clearCustomNodeError,
    clearSelectionForDeletedNode,
    clearSelectionForDeletedEdge
  } = useTopoViewerActions();

  // Graph state from the graph store (React Flow is source of truth)
  const { nodes, edges } = useGraphState();
  const {
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodeData,
    updateEdge,
    renameNode
  } = useGraphActions();

  const undoRedoControls = React.useMemo(
    () => ({
      undo: () => {
        void executeTopologyCommand({ command: "undo" });
      },
      redo: () => {
        void executeTopologyCommand({ command: "redo" });
      },
      canUndo: state.canUndo,
      canRedo: state.canRedo
    }),
    [state.canUndo, state.canRedo]
  );
  const annotations = useAnnotations({ rfInstance, onLockedAction });

  // Toast notifications
  const { toasts, addToast, dismissToast } = useToasts();

  useCustomNodeErrorToast(state.customNodeError, addToast, clearCustomNodeError);

  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );

  const { filteredNodes, filteredEdges } = useFilteredGraphElements(
    nodes as TopoNode[],
    edges as TopoEdge[],
    state.showDummyLinks
  );

  const selectionData = useSelectionData(
    state,
    nodes as TopoNode[],
    edges as TopoEdge[],
    edgeAnnotationLookup
  );

  const navbarCommands = useNavbarCommands();

  // Context menu handlers
  const menuHandlers = useContextMenuHandlers({
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork,
    onDeleteNode: clearSelectionForDeletedNode,
    onDeleteEdge: clearSelectionForDeletedEdge
  });

  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  const renameNodeInGraph = React.useCallback(
    (oldId: string, newId: string, name?: string) => {
      renameNode(oldId, newId, name);
    },
    [renameNode]
  );

  // Direct node/edge addition
  const addNodeDirect = React.useCallback(
    (node: TopoNode) => {
      addNode(node);
    },
    [addNode]
  );

  const addEdgeDirect = React.useCallback(
    (edge: TopoEdge) => {
      addEdge(edge);
    },
    [addEdge]
  );

  // Stable getters for ReactFlow state
  const getNodes = React.useCallback(() => rfInstance?.getNodes() ?? [], [rfInstance]);
  const getEdges = React.useCallback(
    (): TopoEdge[] => (rfInstance?.getEdges() ?? []) as TopoEdge[],
    [rfInstance]
  );

  // Graph handlers using context
  const { handleEdgeCreated, handleNodeCreatedCallback, handleDeleteNode, handleDeleteLink } =
    useGraphHandlersWithContext({
      getNodes,
      getEdges,
      addNode: addNodeDirect,
      addEdge: addEdgeDirect,
      removeNodeAndEdges,
      removeEdge,
      menuHandlers
    });

  const handleUpdateNodeData = React.useCallback(
    (nodeId: string, extraData: Record<string, unknown>) => {
      updateNodeData(nodeId, extraData);
    },
    [updateNodeData]
  );

  const handleUpdateEdgeData = React.useCallback(
    (edgeId: string, data: LinkEditorData) => {
      const saveData = convertEditorDataToLinkSaveData(data);
      updateEdge(edgeId, {
        source: saveData.source,
        target: saveData.target,
        data: {
          sourceEndpoint: saveData.sourceEndpoint ?? data.sourceEndpoint,
          targetEndpoint: saveData.targetEndpoint ?? data.targetEndpoint,
          ...(saveData.extraData ? { extraData: saveData.extraData } : {})
        }
      });
    },
    [updateEdge]
  );

  // Editor handlers
  const nodeEditorHandlers = useNodeEditorHandlers(
    editNode,
    selectionData.editingNodeData,
    renameNodeInGraph,
    handleUpdateNodeData,
    refreshEditorData
  );
  const persistEdgeAnnotations = React.useCallback(
    (next: typeof state.edgeAnnotations) => {
      setEdgeAnnotations(next);
      void saveEdgeAnnotations(next);
    },
    [setEdgeAnnotations]
  );

  const linkEditorHandlers = useLinkEditorHandlers(
    editEdge,
    selectionData.editingLinkData,
    {
      edgeAnnotations: state.edgeAnnotations,
      setEdgeAnnotations: persistEdgeAnnotations
    },
    handleUpdateEdgeData
  );
  const networkEditorHandlers = useNetworkEditorHandlers(
    editNetwork,
    selectionData.editingNetworkData,
    renameNodeInGraph
  );

  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  // Graph creation
  const graphCreation = useGraphCreation({
    rfInstance,
    floatingPanelRef,
    state: {
      mode: state.mode,
      isLocked: state.isLocked,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      nodes: nodes as TopoNode[]
    },
    onEdgeCreated: handleEdgeCreated,
    onNodeCreated: handleNodeCreatedCallback,
    addNode: addNodeDirect,
    onNewCustomNode: customNodeCommands.onNewCustomNode
  });

  // E2E testing exposure
  useE2ETestingExposure({
    isLocked: state.isLocked,
    mode: state.mode,
    toggleLock,
    undoRedo: undoRedoControls,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroup: annotations.handleAddGroup,
    createNetworkAtPosition: graphCreation.createNetworkAtPosition,
    editNetwork,
    groups: annotations.groups,
    elements: [],
    setLayout: layoutControls.setLayout,
    setGeoMode: layoutControls.setGeoMode,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode,
    rfInstance,
    selectedNode: state.selectedNode,
    selectedEdge: state.selectedEdge,
    selectNode,
    selectEdge
  });

  // App-level handlers
  const { handleDeselectAll } = useAppHandlers({
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge }
  });

  const shortcutDisplay = useShortcutDisplay();
  const panelVisibility = usePanelVisibility();

  // Clipboard handlers
  const clipboardHandlers = useClipboardHandlers({
    annotations,
    rfInstance,
    handleNodeCreatedCallback,
    handleEdgeCreated
  });

  // Keyboard shortcuts
  useAppKeyboardShortcuts({
    state: {
      mode: state.mode,
      isLocked: state.isLocked,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge
    },
    undoRedo: undoRedoControls,
    annotations: {
      selectedTextIds: annotations.selectedTextIds,
      selectedShapeIds: annotations.selectedShapeIds,
      selectedGroupIds: annotations.selectedGroupIds,
      clearAllSelections: annotations.clearAllSelections,
      handleAddGroup: annotations.handleAddGroup
    },
    clipboardHandlers,
    deleteHandlers: {
      handleDeleteNode,
      handleDeleteLink
    },
    handleDeselectAll
  });

  const easterEgg = useEasterEgg({});

  const { annotationMode, canvasAnnotationHandlers } = useAnnotationCanvasHandlers(annotations);

  const handleZoomToFit = React.useCallback(() => {
    rfInstance?.fitView({ padding: 0.1 }).catch(() => {
      /* ignore */
    });
  }, [rfInstance]);

  return {
    state,
    annotations,
    undoRedo: undoRedoControls,
    toasts,
    dismissToast,
    navbarCommands,
    floatingPanelCommands,
    customNodeCommands,
    menuHandlers,
    graphCreation,
    selectionData,
    nodeEditorHandlers,
    linkEditorHandlers,
    networkEditorHandlers,
    customTemplateEditorData,
    customTemplateHandlers,
    filteredNodes,
    filteredEdges,
    annotationMode,
    canvasAnnotationHandlers,
    shortcutDisplay,
    panelVisibility,
    easterEgg,
    handleZoomToFit,
    handleEdgeCreated,
    handleDeleteNode,
    handleDeleteLink
  };
}
