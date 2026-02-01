/**
 * App content - UI composition for the React TopoViewer.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { NetemState } from "../shared/parsing";
import type { TopoEdge, TopoNode, TopologyEdgeData, TopologyHostCommand } from "../shared/types";

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
  EditorPanels,
  ViewPanels,
  PalettePanel,
  type LinkImpairmentData
} from "./components/panels";
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
  useNavbarCommands,
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
  const { isShaking: isLockShaking, trigger: triggerLockShake } = useShakeAnimation();

  const { annotations, annotationMode, canvasAnnotationHandlers } = useAppAnnotations({
    rfInstance,
    onLockedAction: triggerLockShake
  });

  const { toasts, dismissToast, addToast } = useAppToasts({
    customNodeError: state.customNodeError,
    clearCustomNodeError: topoActions.clearCustomNodeError
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

  const navbarCommands = useNavbarCommands();
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
    onLockedAction: triggerLockShake,
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
        triggerLockShake();
        return;
      }
      // Find the template by name
      const template = state.customNodes.find((t) => t.name === templateName);
      if (template) {
        graphCreation.createNodeAtPosition(position, template);
      }
    },
    [isInteractionLocked, state.customNodes, graphCreation, triggerLockShake]
  );

  const handleDropCreateNetwork = React.useCallback(
    (position: { x: number; y: number }, networkType: string) => {
      if (isInteractionLocked) {
        triggerLockShake();
        return;
      }
      graphCreation.createNetworkAtPosition(position, networkType as Parameters<typeof graphCreation.createNetworkAtPosition>[1]);
    },
    [isInteractionLocked, graphCreation, triggerLockShake]
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
  const { handleCloseBulkLink, handleCloseNodePalette, handleCloseLabSettings } =
    panelVisibility;

  const processingRef = React.useRef(false);
  React.useEffect(() => {
    if (isProcessing) {
      if (processingRef.current) return;
      processingRef.current = true;
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
      annotationUiActions.disableAddTextMode();
      annotationUiActions.disableAddShapeMode();
      annotationUiActions.clearAllSelections();
      handleCloseBulkLink();
      handleCloseNodePalette();
      handleCloseLabSettings();
      return;
    }
    processingRef.current = false;
  }, [
    annotationUiActions,
    handleCloseBulkLink,
    handleCloseLabSettings,
    handleCloseNodePalette,
    isProcessing,
    topoActions
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

  const handleZoomToFit = React.useCallback(() => {
    rfInstance?.fitView({ padding: 0.1 }).catch(() => {
      /* ignore */
    });
  }, [rfInstance]);

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
    <div className="topoviewer-app" data-testid="topoviewer-app">
      <Navbar
        onZoomToFit={handleZoomToFit}
        onToggleLayout={navbarCommands.onLayoutToggle}
        layout={layoutControls.layout}
        onLayoutChange={layoutControls.setLayout}
        gridLineWidth={layoutControls.gridLineWidth}
        onGridLineWidthChange={layoutControls.setGridLineWidth}
        gridStyle={layoutControls.gridStyle}
        onGridStyleChange={layoutControls.setGridStyle}
        onLabSettings={panelVisibility.handleShowLabSettings}
        onToggleSplit={navbarCommands.onToggleSplit}
        onFindNode={panelVisibility.handleShowFindNode}
        onCaptureViewport={panelVisibility.handleShowSvgExport}
        onShowShortcuts={panelVisibility.handleShowShortcuts}
        onShowAbout={panelVisibility.handleShowAbout}
        shortcutDisplayEnabled={shortcutDisplay.isEnabled}
        onToggleShortcutDisplay={shortcutDisplay.toggle}
        onOpenNodePalette={panelVisibility.handleShowNodePalette}
        onLockedAction={triggerLockShake}
        lockShakeActive={isLockShaking}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={undoRedo.undo}
        onRedo={undoRedo.redo}
        onLogoClick={easterEgg.handleLogoClick}
        logoClickProgress={easterEgg.state.progress}
        isPartyMode={easterEgg.state.isPartyMode}
      />
      <main className="topoviewer-main">
        <ReactFlowCanvas
          ref={reactFlowRef}
          nodes={filteredNodes}
          edges={renderedEdges}
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
          onOpenNodePalette={panelVisibility.handleShowNodePalette}
          onAddGroup={annotations.handleAddGroup}
          onAddText={annotations.handleAddText}
          onAddShapes={annotations.handleAddShapes}
          onAddTextAtPosition={annotations.createTextAtPosition}
          onAddGroupAtPosition={annotations.createGroupAtPosition}
          onAddShapeAtPosition={annotations.createShapeAtPosition}
          onShowBulkLink={panelVisibility.handleShowBulkLink}
          onDropCreateNode={handleDropCreateNode}
          onDropCreateNetwork={handleDropCreateNetwork}
          onLockedAction={triggerLockShake}
        />
        <ViewPanels
          nodeInfo={{
            isVisible: !!state.selectedNode && state.mode === "view",
            nodeData: selectionData.selectedNodeData,
            onClose: menuHandlers.handleCloseNodePanel
          }}
          linkInfo={{
            isVisible: !!state.selectedEdge && state.mode === "view",
            linkData: selectionData.selectedLinkData,
            onClose: menuHandlers.handleCloseLinkPanel
          }}
          linkImpairment={{
            isVisible: !!state.editingImpairment,
            linkData: selectionData.selectedLinkImpairmentData,
            onError: handleLinkImpairmentError,
            onApply: handleLinkImpairmentApply,
            onSave: handleLinkImpairmentSave,
            onClose: () => topoActions.editImpairment(null)
          }}
          shortcuts={{
            isVisible: panelVisibility.showShortcutsPanel,
            onClose: panelVisibility.handleCloseShortcuts
          }}
          about={{
            isVisible: panelVisibility.showAboutPanel,
            onClose: panelVisibility.handleCloseAbout
          }}
          findNode={{
            isVisible: panelVisibility.showFindNodePanel,
            onClose: panelVisibility.handleCloseFindNode,
            rfInstance
          }}
          svgExport={{
            isVisible: panelVisibility.showSvgExportPanel,
            onClose: panelVisibility.handleCloseSvgExport,
            textAnnotations: annotations.textAnnotations,
            shapeAnnotations: annotations.shapeAnnotations,
            groups: annotations.groups,
            rfInstance,
            customIcons: getCustomIconMap(state.customIcons)
          }}
        />
        <EditorPanels
          nodeEditor={{
            isVisible: !!state.editingNode && !isProcessing,
            nodeData: selectionData.editingNodeData,
            inheritedProps: selectionData.editingNodeInheritedProps,
            onClose: nodeEditorHandlers.handleClose,
            onSave: nodeEditorHandlers.handleSave,
            onApply: nodeEditorHandlers.handleApply
          }}
          networkEditor={{
            isVisible: !!state.editingNetwork && !isProcessing,
            nodeData: selectionData.editingNetworkData,
            onClose: networkEditorHandlers.handleClose,
            onSave: handleNetworkSave,
            onApply: handleNetworkApply
          }}
          customTemplateEditor={{
            isVisible: !!state.editingCustomTemplate && !isProcessing,
            nodeData: customTemplateEditorData,
            onClose: customTemplateHandlers.handleClose,
            onSave: customTemplateHandlers.handleSave,
            onApply: customTemplateHandlers.handleApply
          }}
          linkEditor={{
            isVisible: !!state.editingEdge && !isProcessing,
            linkData: selectionData.editingLinkData,
            onClose: linkEditorHandlers.handleClose,
            onSave: linkEditorHandlers.handleSave,
            onApply: linkEditorHandlers.handleApply,
            onAutoApplyOffset: linkEditorHandlers.handleAutoApplyOffset
          }}
          bulkLink={{
            isVisible: panelVisibility.showBulkLinkPanel && !isProcessing,
            mode: interactionMode,
            isLocked: isInteractionLocked,
            onClose: panelVisibility.handleCloseBulkLink
          }}
          freeTextEditor={{
            isVisible: !!annotations.editingTextAnnotation && !isProcessing,
            annotation: annotations.editingTextAnnotation,
            onSave: annotations.saveTextAnnotation,
            onClose: annotations.closeTextEditor,
            onDelete: annotations.deleteTextAnnotation
          }}
          freeShapeEditor={{
            isVisible: !!annotations.editingShapeAnnotation && !isProcessing,
            annotation: annotations.editingShapeAnnotation,
            onSave: annotations.saveShapeAnnotation,
            onClose: annotations.closeShapeEditor,
            onDelete: annotations.deleteShapeAnnotation
          }}
          groupEditor={{
            isVisible: !!annotations.editingGroup && !isProcessing,
            groupData: annotations.editingGroup,
            onSave: annotations.saveGroup,
            onClose: annotations.closeGroupEditor,
            onDelete: annotations.deleteGroup,
            onStyleChange: annotations.updateGroup
          }}
          labSettings={{
            isVisible: panelVisibility.showLabSettingsPanel,
            mode: state.mode,
            isLocked: isInteractionLocked,
            labSettings: state.labSettings ?? { name: state.labName },
            onClose: panelVisibility.handleCloseLabSettings
          }}
        />
        {state.mode === "edit" && !isProcessing && (
          <PalettePanel
            isVisible={panelVisibility.showNodePalettePanel}
            onClose={panelVisibility.handleCloseNodePalette}
            onEditCustomNode={customNodeCommands.onEditCustomNode}
            onDeleteCustomNode={customNodeCommands.onDeleteCustomNode}
            onSetDefaultCustomNode={customNodeCommands.onSetDefaultCustomNode}
          />
        )}
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
        <EasterEggRenderer easterEgg={easterEgg} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
};
