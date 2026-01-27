/**
 * AppContent view-model hook - consolidates AppContent logic into focused helpers.
 */
/* eslint-disable import-x/max-dependencies */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { TopoEdge, TopoNode } from "../../../shared/types/graph";
import type { LinkEditorData } from "../../../shared/types/editors";
import type { AnnotationHandlers } from "../../components/canvas/types";
import type { FloatingActionPanelHandle } from "../../components/panels";
import type { useLayoutControls } from "../ui";
import { convertToEditorData, convertToNetworkEditorData } from "../../../shared/utilities";
import { useTopoViewerActions, useTopoViewerState } from "../useTopoViewerCompat";
import { useGraph, useGraphActions } from "../useGraphCompat";
import { useUndoRedoContext } from "../useUndoRedoCompat";
import { useAnnotations } from "../useAnnotationsCompat";
import { useToasts } from "../../components/ui/Toast";
import { useEasterEgg } from "../../easter-eggs";
import { useGraphHandlersWithContext, useCustomTemplateEditor } from "../state";
import {
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers,
  useContextMenuHandlers
} from "../ui";
import { useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers } from "../panels";
import { useExternalFileChange } from "../useExternalFileChange";
import { buildEdgeAnnotationLookup, findEdgeAnnotationInLookup } from "../../utils/edgeAnnotations";
import {
  convertToLinkEditorData,
  convertEditorDataToLinkSaveData
} from "../../utils/linkEditorConversions";
import { parseEndpointLabelOffset } from "../../utils/endpointLabelOffset";

import { useCustomNodeCommands, useNavbarCommands, useE2ETestingExposure } from "./useAppHelpers";
import { useClipboardHandlers } from "./useClipboardHandlers";
import { useAppKeyboardShortcuts } from "./useAppKeyboardShortcuts";
import { useGraphCreation } from "./useGraphCreation";

type LayoutControls = ReturnType<typeof useLayoutControls>;

interface UseAppContentViewModelParams {
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: LayoutControls;
  onLockedAction?: () => void;
}

function useCustomNodeErrorToast(
  customNodeError: unknown,
  addToast: (message: string, type?: "success" | "error" | "info", duration?: number) => void,
  clearCustomNodeError: () => void
): void {
  React.useEffect(() => {
    if (!customNodeError) return;
    const errorMsg = typeof customNodeError === "string" ? customNodeError : "Unknown error";
    addToast(`Failed to save custom node: ${errorMsg}`, "error", 5000);
    clearCustomNodeError();
  }, [customNodeError, addToast, clearCustomNodeError]);
}

function useFilteredGraphElements(
  nodes: TopoNode[],
  edges: TopoEdge[],
  showDummyLinks: boolean
): { filteredNodes: TopoNode[]; filteredEdges: TopoEdge[] } {
  const filteredNodes = React.useMemo(() => {
    if (showDummyLinks) return nodes;
    return nodes.filter((node) => !node.id.startsWith("dummy"));
  }, [nodes, showDummyLinks]);

  const filteredEdges = React.useMemo(() => {
    if (showDummyLinks) return edges;
    const dummyNodeIds = new Set(
      nodes.filter((node) => node.id.startsWith("dummy")).map((node) => node.id)
    );
    return edges.filter((edge) => !dummyNodeIds.has(edge.source) && !dummyNodeIds.has(edge.target));
  }, [nodes, edges, showDummyLinks]);

  return { filteredNodes, filteredEdges };
}

function useSelectionData(
  state: ReturnType<typeof useTopoViewerState>["state"],
  nodes: TopoNode[],
  edges: TopoEdge[],
  edgeAnnotationLookup: ReturnType<typeof buildEdgeAnnotationLookup>
) {
  const selectedNodeData = React.useMemo(() => {
    if (!state.selectedNode) return null;
    const node = nodes.find((n) => n.id === state.selectedNode);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.selectedNode, nodes]);

  const selectedLinkData = React.useMemo(() => {
    if (!state.selectedEdge) return null;
    const edge = edges.find((e) => e.id === state.selectedEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.selectedEdge, edges]);

  const editingNodeRawData = React.useMemo(() => {
    if (!state.editingNode) return null;
    const node = nodes.find((n) => n.id === state.editingNode);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.editingNode, nodes]);

  const editingNetworkRawData = React.useMemo(() => {
    if (!state.editingNetwork) return null;
    const node = nodes.find((n) => n.id === state.editingNetwork);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.editingNetwork, nodes]);

  const editingLinkRawData = React.useMemo(() => {
    if (!state.editingEdge) return null;
    const edge = edges.find((e) => e.id === state.editingEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.editingEdge, edges]);

  const editingNodeData = React.useMemo(
    () => convertToEditorData(editingNodeRawData),
    [editingNodeRawData]
  );
  const editingNodeInheritedProps = React.useMemo(() => {
    const extra = (editingNodeRawData as Record<string, unknown> | null)?.extraData as
      | Record<string, unknown>
      | undefined;
    const inherited = extra?.inherited;
    return Array.isArray(inherited)
      ? inherited.filter((p): p is string => typeof p === "string")
      : [];
  }, [editingNodeRawData]);
  const editingNetworkData = React.useMemo(
    () => convertToNetworkEditorData(editingNetworkRawData),
    [editingNetworkRawData]
  );
  const editingLinkData = React.useMemo(() => {
    const base = convertToLinkEditorData(editingLinkRawData);
    if (!base) return null;
    const annotation = findEdgeAnnotationInLookup(edgeAnnotationLookup, {
      id: base.id,
      source: base.source,
      target: base.target,
      sourceEndpoint: base.sourceEndpoint,
      targetEndpoint: base.targetEndpoint
    });
    const offset =
      parseEndpointLabelOffset(annotation?.endpointLabelOffset) ?? state.endpointLabelOffset;
    const enabled =
      annotation?.endpointLabelOffsetEnabled ??
      (annotation?.endpointLabelOffset !== undefined ? true : false);
    return {
      ...base,
      endpointLabelOffsetEnabled: enabled,
      endpointLabelOffset: offset
    };
  }, [editingLinkRawData, edgeAnnotationLookup, state.endpointLabelOffset]);

  return {
    selectedNodeData,
    selectedLinkData,
    editingNodeData,
    editingNetworkData,
    editingLinkData,
    editingNodeInheritedProps
  };
}

function useAnnotationCanvasHandlers(annotations: ReturnType<typeof useAnnotations>): {
  annotationMode: {
    isAddTextMode: boolean;
    isAddShapeMode: boolean;
    pendingShapeType?: "rectangle" | "circle" | "line";
  };
  canvasAnnotationHandlers: AnnotationHandlers;
} {
  const annotationMode = React.useMemo(
    () => ({
      isAddTextMode: annotations.isAddTextMode,
      isAddShapeMode: annotations.isAddShapeMode,
      pendingShapeType: annotations.isAddShapeMode ? annotations.pendingShapeType : undefined
    }),
    [annotations.isAddTextMode, annotations.isAddShapeMode, annotations.pendingShapeType]
  );

  const canvasAnnotationHandlers = React.useMemo(
    () => ({
      // Add mode handlers
      onAddTextClick: annotations.handleTextCanvasClick,
      onAddShapeClick: annotations.handleShapeCanvasClick,
      disableAddTextMode: annotations.disableAddTextMode,
      disableAddShapeMode: annotations.disableAddShapeMode,
      // Edit handlers
      onEditFreeText: annotations.editTextAnnotation,
      onEditFreeShape: annotations.editShapeAnnotation,
      // Delete handlers
      onDeleteFreeText: annotations.deleteTextAnnotation,
      onDeleteFreeShape: annotations.deleteShapeAnnotation,
      // Size update handlers (for resize)
      onUpdateFreeTextSize: annotations.updateTextSize,
      onUpdateFreeShapeSize: annotations.updateShapeSize,
      // Rotation handlers (live updates during drag)
      onUpdateFreeTextRotation: annotations.updateTextRotation,
      onUpdateFreeShapeRotation: annotations.updateShapeRotation,
      // Rotation start/end handlers (for undo/redo)
      onFreeTextRotationStart: annotations.onTextRotationStart,
      onFreeTextRotationEnd: annotations.onTextRotationEnd,
      onFreeShapeRotationStart: annotations.onShapeRotationStart,
      onFreeShapeRotationEnd: annotations.onShapeRotationEnd,
      // Line-specific handlers
      onUpdateFreeShapeEndPosition: annotations.updateShapeEndPosition,
      onUpdateFreeShapeStartPosition: (id: string, startPosition: { x: number; y: number }) => {
        // Update both position and recalculate end position
        const shape = annotations.shapeAnnotations.find((s) => s.id === id);
        if (shape && shape.endPosition) {
          const dx = startPosition.x - shape.position.x;
          const dy = startPosition.y - shape.position.y;
          annotations.updateShapeAnnotation(id, {
            position: startPosition,
            endPosition: { x: shape.endPosition.x + dx, y: shape.endPosition.y + dy }
          });
        }
      },
      // Node dropped handler (for group membership)
      onNodeDropped: annotations.onNodeDropped,
      // Group handlers
      onUpdateGroupSize: annotations.updateGroupSize,
      onEditGroup: annotations.editGroup,
      onDeleteGroup: annotations.deleteGroup,
      // Get group members (for group dragging)
      getGroupMembers: annotations.getGroupMembers
    }),
    [annotations]
  );

  return {
    annotationMode,
    canvasAnnotationHandlers: canvasAnnotationHandlers as AnnotationHandlers
  };
}

export function useAppContentViewModel({
  floatingPanelRef,
  rfInstance,
  layoutControls,
  onLockedAction
}: UseAppContentViewModelParams) {
  const { state } = useTopoViewerState();
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

  // Graph state from GraphContext (React Flow is source of truth)
  const { nodes, edges } = useGraph();
  const {
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodeData,
    updateEdge,
    renameNode
  } = useGraphActions();

  const { undoRedo } = useUndoRedoContext();
  const annotations = useAnnotations({ rfInstance, onLockedAction });

  // Toast notifications
  const { toasts, addToast, dismissToast } = useToasts();

  useCustomNodeErrorToast(state.customNodeError, addToast, clearCustomNodeError);

  // Clear undo history on external file changes
  useExternalFileChange({
    undoRedo,
    addToast,
    enabled: state.mode === "edit"
  });

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
      menuHandlers,
      undoRedo
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
    state.customIcons,
    handleUpdateNodeData,
    refreshEditorData
  );
  const linkEditorHandlers = useLinkEditorHandlers(
    editEdge,
    selectionData.editingLinkData,
    {
      edgeAnnotations: state.edgeAnnotations,
      setEdgeAnnotations
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
    undoRedo,
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
    undoRedo: {
      beginBatch: undoRedo.beginBatch,
      endBatch: undoRedo.endBatch
    },
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
    undoRedo: {
      undo: undoRedo.undo,
      redo: undoRedo.redo,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo
    },
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
    undoRedo,
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
