/**
 * App content - UI composition for the React TopoViewer.
 */
/* eslint-disable import-x/max-dependencies */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";

import type { NetemState } from "../shared/parsing";
import type { TopoEdge, TopoNode, TopologyEdgeData, TopologyHostCommand } from "../shared/types";

import { MuiThemeProvider } from "./theme";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE,
  findEdgeAnnotationInLookup,
  nodesToAnnotations,
  collectNodeGroupMemberships,
  parseEndpointLabelOffset
} from "./annotations";
import type { ReactFlowCanvasRef } from "./components/canvas";
import { ReactFlowCanvas } from "./components/canvas";
import { Navbar } from "./components/navbar/Navbar";
import {
  AboutModal,
  type LinkImpairmentData
} from "./components/panels";
import { ContextPanel } from "./components/panels/context-panel";
import { LabSettingsModal } from "./components/panels/lab-settings/LabSettingsModal";
import { ShortcutsModal } from "./components/panels/ShortcutsModal";
import { SvgExportModal } from "./components/panels/SvgExportModal";
import { BulkLinkModal } from "./components/panels/BulkLinkModal";
import { GridSettingsPopover } from "./components/panels/GridSettingsPopover";
import { FindNodePopover } from "./components/panels/FindNodePopover";
import { ShortcutDisplay, ToastContainer } from "./components/ui";
import { EasterEggRenderer, useEasterEgg } from "./easter-eggs";
import {
  useAppAnnotations,
  useAppDerivedData,
  useAppEditorBindings,
  useAppE2EExposure,
  useAppGraphHandlers,
  useAppKeyboardShortcuts,
  useAppToasts,
  useClipboardHandlers,
  useCustomNodeCommands,
  useGraphCreation,
  useIconReconciliation,
  useUndoRedoControls
} from "./hooks/app";
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
  useGraphActions,
  useGraphState,
  useGraphStore,
  useTopoViewerActions,
  useTopoViewerState
} from "./stores";
import { executeTopologyCommand, toLinkSaveData, getCustomIconMap } from "./services";
import {
  PENDING_NETEM_KEY,
  areNetemEquivalent,
  createPendingNetemOverride
} from "./utils/netemOverrides";

type LayoutControls = ReturnType<typeof useLayoutControls>;

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
  const nodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  const edgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id));

  if (selectedNodeId) nodeIds.add(selectedNodeId);
  if (selectedEdgeId) edgeIds.add(selectedEdgeId);

  return { nodeIds, edgeIds };
}

function splitNodeIdsByType(
  nodeIds: Set<string>,
  nodesById: Map<string, { type?: string }>
): { graphNodeIds: string[]; groupIds: string[]; textIds: string[]; shapeIds: string[] } {
  const graphNodeIds: string[] = [];
  const groupIds: string[] = [];
  const textIds: string[] = [];
  const shapeIds: string[] = [];

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
      default:
        graphNodeIds.push(nodeId);
    }
  }

  return { graphNodeIds, groupIds, textIds, shapeIds };
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
  const { freeTextAnnotations, freeShapeAnnotations, groups } = nodesToAnnotations(graphNodesForSave);
  const memberships = collectNodeGroupMemberships(graphNodesForSave);

  return {
    command: "setAnnotationsWithMemberships",
    payload: {
      annotations: {
        freeTextAnnotations,
        freeShapeAnnotations,
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

export interface AppContentProps {
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: LayoutControls;
  onInit: (instance: ReactFlowInstance) => void;
}

export const AppContent: React.FC<AppContentProps> = ({
  reactFlowRef,
  rfInstance,
  layoutControls,
  onInit
}) => {
  const state = useTopoViewerState();
  const topoActions = useTopoViewerActions();
  const { nodes, edges } = useGraphState();
  const graphActions = useGraphActions();
  const annotationUiActions = useAnnotationUIActions();
  const isProcessing = state.isProcessing;
  const isInteractionLocked = getInteractionLockState(state.isLocked, isProcessing);
  const interactionMode = getInteractionMode(state.mode, isProcessing);

  const graphNodes = nodes as TopoNode[];
  const graphEdges = edges as TopoEdge[];

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

  const { annotations, annotationMode, canvasAnnotationHandlers } = useAppAnnotations({
    rfInstance,
    onLockedAction: handleLockedAction
  });

  const { filteredNodes, filteredEdges, selectionData, edgeAnnotationLookup } = useAppDerivedData({
    state,
    nodes: graphNodes,
    edges: graphEdges
  });

  const renderedEdges = React.useMemo(() => {
    if (filteredEdges.length === 0) return filteredEdges;
    return filteredEdges.map((edge) => {
      const data = (edge.data ?? {}) as TopologyEdgeData;
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
      const enabled = annotationEnabled ?? state.endpointLabelOffsetEnabled;
      const resolvedOffset = enabled ? annotationOffset ?? state.endpointLabelOffset : 0;

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
  }, [
    filteredEdges,
    edgeAnnotationLookup,
    state.endpointLabelOffset,
    state.endpointLabelOffsetEnabled
  ]);

  const [paletteTabRequest, setPaletteTabRequest] = React.useState<{ tab: number } | undefined>(undefined);
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
      const edgeData = edge.data as Record<string, unknown> | undefined;
      const extraData = (edgeData?.extraData ?? {}) as Record<string, unknown>;
      const currentSourceNetem = extraData.clabSourceNetem as NetemState | undefined;
      const currentTargetNetem = extraData.clabTargetNetem as NetemState | undefined;
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

  const {
    nodeEditorHandlers,
    linkEditorHandlers,
    networkEditorHandlers,
    customTemplateEditorData,
    customTemplateHandlers
  } = useAppEditorBindings({
    selectionData,
    state: {
      edgeAnnotations: state.edgeAnnotations,
      editingCustomTemplate: state.editingCustomTemplate
    },
    actions: {
      editNode: topoActions.editNode,
      editEdge: topoActions.editEdge,
      editNetwork: topoActions.editNetwork,
      editCustomTemplate: topoActions.editCustomTemplate,
      setEdgeAnnotations: topoActions.setEdgeAnnotations,
      refreshEditorData: topoActions.refreshEditorData
    },
    renameNodeInGraph: graphHandlers.renameNodeInGraph,
    handleUpdateNodeData: graphHandlers.handleUpdateNodeData,
    handleUpdateEdgeData: graphHandlers.handleUpdateEdgeData
  });

  const graphCreation = useGraphCreation({
    rfInstance,
    onLockedAction: handleLockedAction,
    state: {
      mode: interactionMode,
      isLocked: isInteractionLocked,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      nodes: graphNodes
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
      graphCreation.createNetworkAtPosition(position, networkType as Parameters<typeof graphCreation.createNetworkAtPosition>[1]);
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
    annotations,
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
    topoActions.editCustomTemplate(null);
    topoActions.selectNode(null);
    topoActions.selectEdge(null);
    annotationUiActions.closeTextEditor();
    annotationUiActions.closeShapeEditor();
    annotationUiActions.closeGroupEditor();
  }, [topoActions, annotationUiActions]);

  const hasContextContent =
    !!state.selectedNode ||
    !!state.selectedEdge ||
    !!state.editingNode ||
    !!state.editingEdge ||
    !!state.editingNetwork ||
    !!state.editingImpairment ||
    !!state.editingCustomTemplate ||
    !!annotations.editingTextAnnotation ||
    !!annotations.editingShapeAnnotation ||
    !!annotations.editingGroup;

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
  }, [
    clearAllEditingState,
    hasContextContent,
    panelVisibility,
  ]);

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
  }, [
    annotationUiActions,
    clearAllEditingState,
    isProcessing,
    panelVisibility
  ]);

  const clipboardHandlers = useClipboardHandlers({
    annotations,
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
    const edgesById = new Map(currentEdges.map((edge) => [edge.id, edge as TopoEdge]));

    const { graphNodeIds, groupIds, textIds, shapeIds } = splitNodeIdsByType(
      nodeIds,
      nodesById
    );

    applyGraphDeletions(graphActions, menuHandlers, graphNodeIds, edgeIds);

    const annotationResult = annotations.deleteSelectedForBatch({
      groupIds,
      textIds,
      shapeIds
    });

    const commands = buildDeleteCommands(graphNodeIds, edgeIds, edgesById);

    if (annotationResult.didDelete || annotationResult.membersCleared) {
      const graphNodesForSave = useGraphStore.getState().nodes;
      commands.push(buildAnnotationSaveCommand(graphNodesForSave as TopoNode[]));
    }

    if (commands.length === 0) return;

    executeTopologyCommand({ command: "batch", payload: { commands } }, { applySnapshot: false })
      .catch((err) => {
        console.error("[TopoViewer] Failed to batch delete", err);
      });
  }, [annotations, graphActions, menuHandlers, state.selectedNode, state.selectedEdge]);

  useAppKeyboardShortcuts({
    state: {
      mode: interactionMode,
      isLocked: isInteractionLocked,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge
    },
    undoRedo,
    annotations: {
      selectedTextIds: annotations.selectedTextIds,
      selectedShapeIds: annotations.selectedShapeIds,
      selectedGroupIds: annotations.selectedGroupIds,
      clearAllSelections: annotations.clearAllSelections,
      handleAddGroup: annotations.handleAddGroup
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

  // Track used custom icons and copy them to workspace .clab-icons/ folder
  useIconReconciliation(nodes);

  // Auto-open context panel when selection/editing state changes
  React.useEffect(() => {
    if (hasContextContent && !isProcessing && !panelVisibility.isContextPanelOpen) {
      panelVisibility.handleOpenContextPanel("auto");
    }
  }, [
    hasContextContent,
    isProcessing,
    panelVisibility,
  ]);

  // close if palette wasn't open, else go back to palette
  const handleContextPanelBack = React.useCallback(() => {
    const shouldClose = panelVisibility.contextPanelOpenReason === "auto";
    clearAllEditingState();
    if (shouldClose) {
      panelVisibility.handleCloseContextPanel();
    }
  }, [clearAllEditingState, panelVisibility]);

  const handleContextPanelDelete = React.useCallback(() => {
    if (state.editingNode) {
      graphHandlers.handleDeleteNode(state.editingNode);
    } else if (state.editingEdge) {
      graphHandlers.handleDeleteLink(state.editingEdge);
    }
  }, [state.editingNode, state.editingEdge, graphHandlers]);

  const handleZoomToFit = React.useCallback(() => {
    if (reactFlowRef.current) {
      reactFlowRef.current.fit();
      return;
    }
    rfInstance?.fitView({ padding: 0.1 }).catch(() => {
      /* ignore */
    });
  }, [reactFlowRef, rfInstance]);

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
        <Navbar
          onZoomToFit={handleZoomToFit}
          layout={layoutControls.layout}
          onLayoutChange={layoutControls.setLayout}
          onLabSettings={panelVisibility.handleShowLabSettings}
          onToggleSplit={() => {
            panelVisibility.handleOpenContextPanel("manual");
            setPaletteTabRequest({ tab: 2 });
          }}
          onFindNode={panelVisibility.handleOpenFindPopover}
          onCaptureViewport={panelVisibility.handleShowSvgExport}
          onShowShortcuts={panelVisibility.handleShowShortcuts}
          onShowAbout={panelVisibility.handleShowAbout}
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
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden", position: "relative" }}>
          <ContextPanel
            isOpen={panelVisibility.isContextPanelOpen}
            side={panelVisibility.panelSide}
            onOpen={panelVisibility.handleOpenContextPanel}
            onClose={panelVisibility.handleCloseContextPanel}
            onBack={handleContextPanelBack}
            onToggleSide={panelVisibility.handleTogglePanelSide}
            onDelete={handleContextPanelDelete}
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
                handleApply: nodeEditorHandlers.handleApply
              },
              editingLinkData: selectionData.editingLinkData,
              linkEditorHandlers: {
                handleClose: linkEditorHandlers.handleClose,
                handleSave: linkEditorHandlers.handleSave,
                handleApply: linkEditorHandlers.handleApply,
                handleAutoApplyOffset: linkEditorHandlers.handleAutoApplyOffset
              },
              editingNetworkData: selectionData.editingNetworkData,
              networkEditorHandlers: {
                handleClose: networkEditorHandlers.handleClose,
                handleSave: handleNetworkSave,
                handleApply: handleNetworkApply
              },
              customTemplateEditorData,
              customTemplateHandlers: {
                handleClose: customTemplateHandlers.handleClose,
                handleSave: customTemplateHandlers.handleSave,
                handleApply: customTemplateHandlers.handleApply
              },
              linkImpairmentData: selectionData.selectedLinkImpairmentData,
              linkImpairmentHandlers: {
                onError: handleLinkImpairmentError,
                onApply: handleLinkImpairmentApply,
                onSave: handleLinkImpairmentSave,
                onClose: () => topoActions.editImpairment(null)
              },
              editingTextAnnotation: annotations.editingTextAnnotation,
              textAnnotationHandlers: {
                onSave: annotations.saveTextAnnotation,
                onClose: annotations.closeTextEditor,
                onDelete: annotations.deleteTextAnnotation
              },
              editingShapeAnnotation: annotations.editingShapeAnnotation,
              shapeAnnotationHandlers: {
                onSave: annotations.saveShapeAnnotation,
                onClose: annotations.closeShapeEditor,
                onDelete: annotations.deleteShapeAnnotation
              },
              editingGroup: annotations.editingGroup,
              groupHandlers: {
                onSave: annotations.saveGroup,
                onClose: annotations.closeGroupEditor,
                onDelete: annotations.deleteGroup,
                onStyleChange: annotations.updateGroup
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
            <ReactFlowCanvas
              ref={reactFlowRef}
              nodes={filteredNodes}
              edges={renderedEdges}
              isContextPanelOpen={panelVisibility.isContextPanelOpen}
              onPaneClick={handleEmptyCanvasClick}
              layout={layoutControls.layout}
              isGeoLayout={layoutControls.isGeoLayout}
              gridLineWidth={layoutControls.gridLineWidth}
              gridStyle={layoutControls.gridStyle}
              annotationMode={annotationMode}
              annotationHandlers={canvasAnnotationHandlers}
              linkLabelMode={state.linkLabelMode}
              onInit={onInit}
              onEdgeCreated={graphHandlers.handleEdgeCreated}
              onShiftClickCreate={graphCreation.createNodeAtPosition}
              onNodeDelete={graphHandlers.handleDeleteNode}
              onEdgeDelete={graphHandlers.handleDeleteLink}
              onOpenNodePalette={() => {
                handleContextPanelBack();
                panelVisibility.handleOpenContextPanel();
              }}
              onAddGroup={annotations.handleAddGroup}
              onAddText={annotations.handleAddText}
              onAddShapes={annotations.handleAddShapes}
              onAddTextAtPosition={annotations.createTextAtPosition}
              onAddGroupAtPosition={annotations.createGroupAtPosition}
              onAddShapeAtPosition={annotations.createShapeAtPosition}
              onShowBulkLink={panelVisibility.handleShowBulkLink}
              onDropCreateNode={handleDropCreateNode}
              onDropCreateNetwork={handleDropCreateNetwork}
              onLockedAction={handleLockedAction}
            />
            <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
            <EasterEggRenderer easterEgg={easterEgg} />
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
          </Box>
        </Box>

        {/* Modals */}
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
        <SvgExportModal
          isOpen={panelVisibility.showSvgExportModal}
          onClose={panelVisibility.handleCloseSvgExport}
          textAnnotations={annotations.textAnnotations}
          shapeAnnotations={annotations.shapeAnnotations}
          groups={annotations.groups}
          rfInstance={rfInstance}
          customIcons={getCustomIconMap(state.customIcons)}
        />
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
