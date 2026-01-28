/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 */
/* eslint-disable import-x/max-dependencies -- App.tsx is the composition root and naturally has many imports */
import React from "react";
import type { Core as CyCore } from "cytoscape";

import { convertToEditorData, convertToNetworkEditorData } from "../shared/utilities";

import type { CytoscapeCanvasRef } from "./components/canvas/CytoscapeCanvas";
import { useTopoViewerActions, useTopoViewerState } from "./context/TopoViewerContext";
import { UndoRedoProvider, useUndoRedoContext } from "./context/UndoRedoContext";
import {
  AnnotationProvider,
  useAnnotations,
  type PendingMembershipChange
} from "./context/AnnotationContext";
import { Navbar } from "./components/navbar/Navbar";
import { CytoscapeCanvas } from "./components/canvas/CytoscapeCanvas";
import { ShortcutDisplay } from "./components/ShortcutDisplay";
import { ContextMenu } from "./components/context-menu/ContextMenu";
import { FloatingActionPanel, type FloatingActionPanelHandle } from "./components/panels";
import { AnnotationLayers } from "./components/AnnotationLayers";
import { EditorPanels } from "./components/EditorPanels";
import { ViewPanels } from "./components/ViewPanels";
import { ToastContainer, useToasts } from "./components/Toast";
import { useEasterEgg, EasterEggRenderer } from "./easter-eggs";
import {
  // Graph manipulation
  useNodeDragging,
  // State management
  useGraphHandlersWithContext,
  useCustomTemplateEditor,
  filterEntriesWithPosition,
  // Canvas/App state
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useContextMenuHandlers,
  useLayoutControls,
  useEndpointLabelOffset,
  useLinkLabelVisibility,
  useGeoMap,
  // Panel handlers
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  // UI hooks
  useContextMenu,
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers,
  // App helper hooks
  useCustomNodeCommands,
  useNavbarCommands,
  useShapeLayer,
  useTextLayer,
  useE2ETestingExposure,
  useGeoCoordinateSync,
  // NEW: Composed hooks
  useAnnotationLayerProps,
  useClipboardHandlers,
  useAppKeyboardShortcuts,
  useGraphCreation,
  // External file change
  useExternalFileChange,
  // Types
  type GraphChange
} from "./hooks/internal";
import { useAltClickDelete, useShiftClickEdgeCreation } from "./hooks/graph";
import { convertToLinkEditorData } from "./utils/linkEditorConversions";
import { buildEdgeAnnotationLookup, findEdgeAnnotationInLookup } from "./utils/edgeAnnotations";
import { parseEndpointLabelOffset } from "./utils/endpointLabelOffset";

/** Inner component that uses contexts */
const AppContent: React.FC<{
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>;
  cyInstance: CyCore | null;
  onCyReady: (cy: CyCore) => void;
  onCyDestroyed: () => void;
  layoutControls: ReturnType<typeof useLayoutControls>;
  mapLibreState: ReturnType<typeof useGeoMap>["mapLibreState"];
  shapeLayerNode: HTMLElement | null;
  textLayerNode: HTMLElement | null;
}> = ({
  floatingPanelRef,
  pendingMembershipChangesRef,
  cytoscapeRef,
  cyInstance,
  onCyReady,
  onCyDestroyed,
  layoutControls,
  mapLibreState,
  shapeLayerNode,
  textLayerNode
}) => {
  const { state, dispatch } = useTopoViewerState();
  const {
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork,
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodePositions,
    editCustomTemplate,
    setEdgeAnnotations,
    toggleLock,
    refreshEditorData,
    clearCustomNodeError
  } = useTopoViewerActions();
  const { undoRedo, registerGraphHandler, registerPropertyEditHandler } = useUndoRedoContext();
  const annotations = useAnnotations();

  // Toast notifications
  const { toasts, addToast, dismissToast } = useToasts();

  // Show toast when custom node save fails
  React.useEffect(() => {
    if (state.customNodeError) {
      const errorMsg =
        typeof state.customNodeError === "string" ? state.customNodeError : "Unknown error";
      addToast(`Failed to save custom node: ${errorMsg}`, "error", 5000);
      clearCustomNodeError();
    }
  }, [state.customNodeError, addToast, clearCustomNodeError]);

  // Clear undo history on external file changes
  useExternalFileChange({
    undoRedo,
    addToast,
    enabled: state.mode === "edit"
  });

  const renameNodeInGraph = React.useCallback(
    (oldId: string, newId: string, name?: string) => {
      dispatch({ type: "RENAME_NODE", payload: { oldId, newId, name } });
    },
    [dispatch]
  );

  useLinkLabelVisibility(cyInstance, state.linkLabelMode);
  useEndpointLabelOffset(cyInstance, {
    globalEnabled: state.endpointLabelOffsetEnabled,
    globalOffset: state.endpointLabelOffset,
    edgeAnnotations: state.edgeAnnotations
  });

  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );

  // Filter elements based on showDummyLinks setting
  // When disabled, hide nodes starting with "dummy" and edges connected to them
  const filteredElements = React.useMemo(() => {
    if (state.showDummyLinks) {
      return state.elements;
    }

    // Identify dummy nodes (IDs starting with "dummy")
    const dummyNodeIds = new Set(
      state.elements
        .filter((el) => el.group === "nodes" && (el.data?.id as string)?.startsWith("dummy"))
        .map((el) => el.data?.id as string)
    );

    // Filter out dummy nodes and edges connected to them
    return state.elements.filter((el) => {
      if (el.group === "nodes") {
        return !dummyNodeIds.has(el.data?.id as string);
      }
      if (el.group === "edges") {
        const data = el.data as { source?: string; target?: string };
        return !dummyNodeIds.has(data.source ?? "") && !dummyNodeIds.has(data.target ?? "");
      }
      return true;
    });
  }, [state.elements, state.showDummyLinks]);

  // Selection and editing data
  const { selectedNodeData, selectedLinkData } = useSelectionData(
    cytoscapeRef,
    state.selectedNode,
    state.selectedEdge,
    state.elements
  );
  const { selectedNodeData: editingNodeRawData } = useSelectionData(
    cytoscapeRef,
    state.editingNode,
    null,
    state.editorDataVersion
  );
  const { selectedNodeData: editingNetworkRawData } = useSelectionData(
    cytoscapeRef,
    state.editingNetwork,
    null,
    state.editorDataVersion
  );
  const { selectedLinkData: editingLinkRawData } = useSelectionData(
    cytoscapeRef,
    null,
    state.editingEdge,
    state.editorDataVersion
  );
  const editingNodeData = React.useMemo(
    () => convertToEditorData(editingNodeRawData),
    [editingNodeRawData]
  );
  const editingNodeInheritedProps = React.useMemo(() => {
    const extra = editingNodeRawData?.extraData as Record<string, unknown> | undefined;
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

  // Navbar and menu handlers
  const { handleZoomToFit } = useNavbarActions(cytoscapeRef, {
    textAnnotations: annotations.textAnnotations,
    shapeAnnotations: annotations.shapeAnnotations,
    groups: annotations.groups
  });

  // Fit viewport to include annotations on initial load
  const initialFitDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!cyInstance || initialFitDoneRef.current) return;

    // Check if initial layout is done
    const layoutDone = cyInstance.scratch("initialLayoutDone") as boolean | undefined;
    if (!layoutDone) return;

    // Do the fit with annotations
    handleZoomToFit();
    initialFitDoneRef.current = true;
  }, [cyInstance, handleZoomToFit]);

  const navbarCommands = useNavbarCommands();
  const menuHandlers = useContextMenuHandlers(cytoscapeRef, {
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork,
    removeNodeAndEdges,
    removeEdge
  });
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Graph handlers using context
  const {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo,
    recordPropertyEdit
  } = useGraphHandlersWithContext({
    cyInstance,
    addNode,
    addEdge,
    menuHandlers,
    edgeAnnotationHandlers: {
      edgeAnnotations: state.edgeAnnotations,
      setEdgeAnnotations
    },
    undoRedo,
    registerGraphHandler,
    registerPropertyEditHandler
  });

  // Geo coordinate sync (consolidated hook)
  useGeoCoordinateSync({
    mapLibreState,
    isGeoLayout: layoutControls.isGeoLayout,
    textAnnotations: annotations.textAnnotations,
    shapeAnnotations: annotations.shapeAnnotations,
    groups: annotations.groups,
    updateTextGeoPosition: annotations.updateTextGeoPosition,
    updateShapeGeoPosition: annotations.updateShapeGeoPosition,
    updateShapeEndGeoPosition: annotations.updateShapeEndGeoPosition,
    updateGroupGeoPosition: annotations.updateGroupGeoPosition
  });

  // Callback to update node data in React state (triggers icon reconciliation)
  const updateNodeData = React.useCallback(
    (nodeId: string, extraData: Record<string, unknown>) => {
      dispatch({ type: "UPDATE_NODE_DATA", payload: { nodeId, extraData } });
    },
    [dispatch]
  );

  // Editor handlers
  const nodeEditorHandlers = useNodeEditorHandlers(
    editNode,
    editingNodeData,
    recordPropertyEdit,
    cytoscapeRef,
    renameNodeInGraph,
    state.customIcons,
    updateNodeData,
    refreshEditorData
  );
  const linkEditorHandlers = useLinkEditorHandlers(
    editEdge,
    editingLinkData,
    recordPropertyEdit,
    cytoscapeRef,
    {
      edgeAnnotations: state.edgeAnnotations,
      setEdgeAnnotations
    }
  );
  const networkEditorHandlers = useNetworkEditorHandlers(
    editNetwork,
    editingNetworkData,
    cyInstance,
    renameNodeInGraph
  );

  const recordGraphChanges = React.useCallback(
    (before: GraphChange[], after: GraphChange[]) => {
      undoRedo.pushAction({ type: "graph", before, after });
    },
    [undoRedo]
  );

  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  // Graph creation (edge, node, network) - composed hook
  const graphCreation = useGraphCreation({
    cyInstance,
    floatingPanelRef,
    state: {
      mode: state.mode,
      isLocked: state.isLocked,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      elements: state.elements
    },
    onEdgeCreated: handleEdgeCreated,
    onNodeCreated: handleNodeCreatedCallback,
    addNode,
    onNewCustomNode: customNodeCommands.onNewCustomNode
  });

  // E2E testing exposure (consolidated hook) - must be after graphCreation
  useE2ETestingExposure({
    cyInstance,
    isLocked: state.isLocked,
    mode: state.mode,
    toggleLock,
    undoRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroupWithUndo: annotations.handleAddGroupWithUndo,
    createNetworkAtPosition: graphCreation.createNetworkAtPosition,
    editNetwork,
    groups: annotations.groups,
    elements: state.elements,
    setLayout: layoutControls.setLayout,
    setGeoMode: layoutControls.setGeoMode,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  // App-level handlers
  const { handleLockedDrag, handleMoveComplete, handleDeselectAll } = useAppHandlers({
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge },
    undoRedo,
    floatingPanelRef,
    isLocked: state.isLocked,
    pendingMembershipChangesRef
  });

  // Context menus
  const { menuState, menuItems, closeMenu } = useContextMenu(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onEditNode: menuHandlers.handleEditNode,
    onEditNetwork: menuHandlers.handleEditNetwork,
    onDeleteNode: handleDeleteNodeWithUndo,
    onCreateLinkFromNode: graphCreation.handleCreateLinkFromNode,
    onEditLink: menuHandlers.handleEditLink,
    onDeleteLink: handleDeleteLinkWithUndo,
    onShowNodeProperties: menuHandlers.handleShowNodeProperties,
    onShowLinkProperties: menuHandlers.handleShowLinkProperties
  });

  // Node dragging
  useNodeDragging(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedDrag: handleLockedDrag,
    onMoveComplete: handleMoveComplete,
    onPositionsCommitted: (positions) => {
      const withPosition = filterEntriesWithPosition(positions);
      if (withPosition.length > 0) updateNodePositions(withPosition);
    }
  });

  // Alt+Click delete for nodes/edges
  useAltClickDelete(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onDeleteNode: handleDeleteNodeWithUndo,
    onDeleteEdge: handleDeleteLinkWithUndo
  });

  // Shift+Click on node to start link creation
  useShiftClickEdgeCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    startEdgeCreation: graphCreation.startEdgeCreation
  });

  // shapeLayerNode is passed as prop from App wrapper
  const shortcutDisplay = useShortcutDisplay();
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Clipboard handlers - composed hook
  const clipboardHandlers = useClipboardHandlers({
    cyInstance,
    annotations,
    undoRedo: {
      beginBatch: undoRedo.beginBatch,
      endBatch: undoRedo.endBatch
    },
    handleNodeCreatedCallback,
    handleEdgeCreated
  });

  const handleSaveTextAnnotationWithUndo = React.useCallback(
    (annotation: Parameters<typeof annotations.saveTextAnnotation>[0]) => {
      const isNew = annotations.editingTextAnnotation?.text === "";
      annotations.saveTextAnnotationWithUndo(annotation, isNew);
    },
    [annotations]
  );

  // Keyboard shortcuts - composed hook
  useAppKeyboardShortcuts({
    state: {
      mode: state.mode,
      isLocked: state.isLocked,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge
    },
    cyInstance,
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
      handleAddGroupWithUndo: annotations.handleAddGroupWithUndo
    },
    clipboardHandlers,
    deleteHandlers: {
      handleDeleteNodeWithUndo,
      handleDeleteLinkWithUndo
    },
    handleDeselectAll
  });

  const easterEgg = useEasterEgg({ cyInstance });

  // Annotation layer props - composed hook
  const { groupLayerProps, freeTextLayerProps, freeShapeLayerProps } = useAnnotationLayerProps({
    cyInstance,
    annotations,
    state: {
      isLocked: state.isLocked,
      mode: state.mode
    },
    layoutControls: {
      isGeoLayout: layoutControls.isGeoLayout,
      geoMode: layoutControls.geoMode
    },
    mapLibreState,
    shapeLayerNode,
    textLayerNode
  });

  return (
    <div className="topoviewer-app" data-testid="topoviewer-app">
      <Navbar
        onZoomToFit={handleZoomToFit}
        onToggleLayout={navbarCommands.onLayoutToggle}
        layout={layoutControls.layout}
        onLayoutChange={layoutControls.setLayout}
        gridLineWidth={layoutControls.gridLineWidth}
        onGridLineWidthChange={layoutControls.setGridLineWidth}
        geoMode={layoutControls.geoMode}
        onGeoModeChange={layoutControls.setGeoMode}
        isGeoLayout={layoutControls.isGeoLayout}
        onLabSettings={panelVisibility.handleShowLabSettings}
        onToggleSplit={navbarCommands.onToggleSplit}
        onFindNode={panelVisibility.handleShowFindNode}
        onCaptureViewport={panelVisibility.handleShowSvgExport}
        onShowShortcuts={panelVisibility.handleShowShortcuts}
        onShowAbout={panelVisibility.handleShowAbout}
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
      <main className="topoviewer-main">
        <CytoscapeCanvas
          ref={cytoscapeRef}
          elements={filteredElements}
          onCyReady={onCyReady}
          onCyDestroyed={onCyDestroyed}
        />
        <AnnotationLayers
          groupLayerProps={groupLayerProps}
          freeTextLayerProps={freeTextLayerProps}
          freeShapeLayerProps={freeShapeLayerProps}
        />
        <ViewPanels
          nodeInfo={{
            isVisible: !!state.selectedNode && state.mode === "view",
            nodeData: selectedNodeData,
            onClose: menuHandlers.handleCloseNodePanel
          }}
          linkInfo={{
            isVisible: !!state.selectedEdge && state.mode === "view",
            linkData: selectedLinkData,
            onClose: menuHandlers.handleCloseLinkPanel
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
            cy: cyInstance
          }}
          svgExport={{
            isVisible: panelVisibility.showSvgExportPanel,
            onClose: panelVisibility.handleCloseSvgExport,
            cy: cyInstance,
            textAnnotations: annotations.textAnnotations,
            shapeAnnotations: annotations.shapeAnnotations,
            groups: annotations.groups
          }}
        />
        <EditorPanels
          nodeEditor={{
            isVisible: !!state.editingNode,
            nodeData: editingNodeData,
            inheritedProps: editingNodeInheritedProps,
            onClose: nodeEditorHandlers.handleClose,
            onSave: nodeEditorHandlers.handleSave,
            onApply: nodeEditorHandlers.handleApply
          }}
          networkEditor={{
            isVisible: !!state.editingNetwork,
            nodeData: editingNetworkData,
            onClose: networkEditorHandlers.handleClose,
            onSave: networkEditorHandlers.handleSave,
            onApply: networkEditorHandlers.handleApply
          }}
          customTemplateEditor={{
            isVisible: !!state.editingCustomTemplate,
            nodeData: customTemplateEditorData,
            onClose: customTemplateHandlers.handleClose,
            onSave: customTemplateHandlers.handleSave,
            onApply: customTemplateHandlers.handleApply
          }}
          linkEditor={{
            isVisible: !!state.editingEdge,
            linkData: editingLinkData,
            onClose: linkEditorHandlers.handleClose,
            onSave: linkEditorHandlers.handleSave,
            onApply: linkEditorHandlers.handleApply,
            onAutoApplyOffset: linkEditorHandlers.handleAutoApplyOffset
          }}
          bulkLink={{
            isVisible: showBulkLinkPanel,
            mode: state.mode,
            isLocked: state.isLocked,
            cy: cyInstance,
            onClose: () => setShowBulkLinkPanel(false),
            recordGraphChanges,
            addEdge
          }}
          freeTextEditor={{
            isVisible: !!annotations.editingTextAnnotation,
            annotation: annotations.editingTextAnnotation,
            onSave: handleSaveTextAnnotationWithUndo,
            onClose: annotations.closeTextEditor,
            onDelete: annotations.deleteTextAnnotationWithUndo
          }}
          freeShapeEditor={{
            isVisible: !!annotations.editingShapeAnnotation,
            annotation: annotations.editingShapeAnnotation,
            onSave: annotations.saveShapeAnnotation,
            onClose: annotations.closeShapeEditor,
            onDelete: annotations.deleteShapeAnnotation
          }}
          groupEditor={{
            isVisible: !!annotations.editingGroup,
            groupData: annotations.editingGroup,
            onSave: annotations.saveGroup,
            onClose: annotations.closeGroupEditor,
            onDelete: annotations.deleteGroup,
            onStyleChange: annotations.updateGroup
          }}
          labSettings={{
            isVisible: panelVisibility.showLabSettingsPanel,
            mode: state.mode,
            isLocked: state.isLocked,
            labSettings: { name: state.labName },
            onClose: panelVisibility.handleCloseLabSettings
          }}
        />
        <FloatingActionPanel
          ref={floatingPanelRef}
          onDeploy={floatingPanelCommands.onDeploy}
          onDestroy={floatingPanelCommands.onDestroy}
          onDeployCleanup={floatingPanelCommands.onDeployCleanup}
          onDestroyCleanup={floatingPanelCommands.onDestroyCleanup}
          onRedeploy={floatingPanelCommands.onRedeploy}
          onRedeployCleanup={floatingPanelCommands.onRedeployCleanup}
          onAddNode={graphCreation.handleAddNodeFromPanel}
          onAddNetwork={graphCreation.handleAddNetworkFromPanel}
          onAddGroup={annotations.handleAddGroupWithUndo}
          onAddText={annotations.handleAddText}
          onAddShapes={annotations.handleAddShapes}
          onAddBulkLink={() => setShowBulkLinkPanel(true)}
          onEditCustomNode={customNodeCommands.onEditCustomNode}
          onDeleteCustomNode={customNodeCommands.onDeleteCustomNode}
          onSetDefaultCustomNode={customNodeCommands.onSetDefaultCustomNode}
          isAddTextMode={annotations.isAddTextMode}
          isAddShapeMode={annotations.isAddShapeMode}
        />
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
        <ContextMenu
          isVisible={menuState.isVisible}
          position={menuState.position}
          items={menuItems}
          onClose={closeMenu}
        />
        <EasterEggRenderer easterEgg={easterEgg} cyInstance={cyInstance} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
};

/** Main App component with providers */
export const App: React.FC = () => {
  const { state } = useTopoViewerState();
  const { updateNodePositions } = useTopoViewerActions();
  const { cytoscapeRef, cyInstance, onCyReady, onCyDestroyed } = useCytoscapeInstance();
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());
  const { shapeLayerNode } = useShapeLayer(cyInstance);
  const { textLayerNode } = useTextLayer(cyInstance);
  const layoutControls = useLayoutControls(cytoscapeRef, cyInstance);
  const { mapLibreState } = useGeoMap({
    cyInstance,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  return (
    <UndoRedoProvider cy={cyInstance} enabled={state.mode === "edit"}>
      <AnnotationProvider
        cy={cyInstance}
        mode={state.mode}
        isLocked={state.isLocked}
        onLockedAction={() => floatingPanelRef.current?.triggerShake()}
        pendingMembershipChangesRef={pendingMembershipChangesRef}
        updateNodePositions={updateNodePositions}
      >
        <AppContent
          floatingPanelRef={floatingPanelRef}
          pendingMembershipChangesRef={pendingMembershipChangesRef}
          cytoscapeRef={cytoscapeRef}
          cyInstance={cyInstance}
          onCyReady={onCyReady}
          onCyDestroyed={onCyDestroyed}
          layoutControls={layoutControls}
          mapLibreState={mapLibreState}
          shapeLayerNode={shapeLayerNode}
          textLayerNode={textLayerNode}
        />
      </AnnotationProvider>
    </UndoRedoProvider>
  );
};
