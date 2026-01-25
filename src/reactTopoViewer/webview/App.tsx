/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 * Now uses ReactFlow as the rendering layer for rendering.
 */
/* eslint-disable import-x/max-dependencies -- App.tsx is the composition root and naturally has many imports */
import React from "react";
import type { ReactFlowInstance, Node, Edge } from "@xyflow/react";

import { convertToEditorData, convertToNetworkEditorData } from "../shared/utilities";
import type { TopoNode, TopoEdge } from "../shared/types/graph";

import { ReactFlowCanvas, type ReactFlowCanvasRef } from "./components/react-flow-canvas";
import { useTopoViewerActions, useTopoViewerState } from "./context/TopoViewerContext";
import { UndoRedoProvider, useUndoRedoContext } from "./context/UndoRedoContext";
import {
  AnnotationProvider,
  useAnnotations,
  type PendingMembershipChange
} from "./context/AnnotationContext";
import { ViewportProvider } from "./context/ViewportContext";
import { Navbar } from "./components/navbar/Navbar";
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
  useLayoutControls,
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
  // Composed hooks
  useAnnotationLayerProps,
  useClipboardHandlers,
  useAppKeyboardShortcuts,
  useGraphCreation,
  // External file change
  useExternalFileChange,
  // Types
  type GraphChange
} from "./hooks/internal";
import { convertToLinkEditorData } from "./utils/linkEditorConversions";
import { buildEdgeAnnotationLookup, findEdgeAnnotationInLookup } from "./utils/edgeAnnotations";
import { parseEndpointLabelOffset } from "./utils/endpointLabelOffset";

/** Inner component that uses contexts */
const AppContent: React.FC<{
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: ReturnType<typeof useLayoutControls>;
  mapLibreState: ReturnType<typeof useGeoMap>["mapLibreState"];
  shapeLayerNode: HTMLElement | null;
  textLayerNode: HTMLElement | null;
  onInit: (instance: ReactFlowInstance) => void;
}> = ({
  floatingPanelRef,
  pendingMembershipChangesRef,
  reactFlowRef,
  rfInstance,
  layoutControls,
  mapLibreState,
  shapeLayerNode,
  textLayerNode,
  onInit
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

  // Direct node/edge addition (no ParsedElement conversion needed)
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

  // Link label visibility is now handled by EdgeRenderConfigContext in ReactFlowCanvas
  // useEndpointLabelOffset is also handled by the edge component
  // These hooks are for React state management

  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );

  // Filter nodes/edges based on showDummyLinks setting
  // When disabled, hide nodes starting with "dummy" and edges connected to them
  const filteredNodes = React.useMemo(() => {
    if (state.showDummyLinks) {
      return state.nodes;
    }
    return (state.nodes as Node[]).filter((node) => !node.id.startsWith("dummy"));
  }, [state.nodes, state.showDummyLinks]);

  const filteredEdges = React.useMemo(() => {
    if (state.showDummyLinks) {
      return state.edges;
    }
    const dummyNodeIds = new Set(
      (state.nodes as Node[]).filter((node) => node.id.startsWith("dummy")).map((node) => node.id)
    );
    return (state.edges as Edge[]).filter(
      (edge) => !dummyNodeIds.has(edge.source) && !dummyNodeIds.has(edge.target)
    );
  }, [state.nodes, state.edges, state.showDummyLinks]);

  // Selection and editing data - now using ReactFlow state directly
  const selectedNodeData = React.useMemo(() => {
    if (!state.selectedNode) return null;
    const node = (state.nodes as Node[]).find((n) => n.id === state.selectedNode);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.selectedNode, state.nodes]);

  const selectedLinkData = React.useMemo(() => {
    if (!state.selectedEdge) return null;
    const edge = (state.edges as Edge[]).find((e) => e.id === state.selectedEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.selectedEdge, state.edges]);

  const editingNodeRawData = React.useMemo(() => {
    if (!state.editingNode) return null;
    const node = (state.nodes as Node[]).find((n) => n.id === state.editingNode);
    return node?.data as Record<string, unknown> | null;
  }, [state.editingNode, state.nodes, state.editorDataVersion]);

  const editingNetworkRawData = React.useMemo(() => {
    if (!state.editingNetwork) return null;
    const node = (state.nodes as Node[]).find((n) => n.id === state.editingNetwork);
    return node?.data as Record<string, unknown> | null;
  }, [state.editingNetwork, state.nodes, state.editorDataVersion]);

  const editingLinkRawData = React.useMemo(() => {
    if (!state.editingEdge) return null;
    const edge = (state.edges as Edge[]).find((e) => e.id === state.editingEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.editingEdge, state.edges, state.editorDataVersion]);
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

  // Navbar and menu handlers - using ReactFlow fitView
  const handleZoomToFit = React.useCallback(() => {
    rfInstance?.fitView({ padding: 0.1 });
  }, [rfInstance]);

  // Fit viewport on initial load
  const initialFitDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!rfInstance || initialFitDoneRef.current) return;
    // ReactFlow handles initial fit via fitView prop
    initialFitDoneRef.current = true;
  }, [rfInstance]);

  const navbarCommands = useNavbarCommands();

  // Context menu handlers - simplified for context menu
  const menuHandlers = React.useMemo(
    () => ({
      handleEditNode: (nodeId: string) => editNode(nodeId),
      handleEditNetwork: (nodeId: string) => editNetwork(nodeId),
      handleDeleteNode: (nodeId: string) => {
        removeNodeAndEdges(nodeId);
        selectNode(null);
      },
      handleCreateLinkFromNode: (_nodeId: string) => {},
      handleEditLink: (edgeId: string) => editEdge(edgeId),
      handleDeleteLink: (edgeId: string) => {
        removeEdge(edgeId);
        selectEdge(null);
      },
      handleShowNodeProperties: (nodeId: string) => selectNode(nodeId),
      handleShowLinkProperties: (edgeId: string) => selectEdge(edgeId),
      handleCloseNodePanel: () => selectNode(null),
      handleCloseLinkPanel: () => selectEdge(null)
    }),
    [editNode, editNetwork, editEdge, removeNodeAndEdges, removeEdge, selectNode, selectEdge]
  );
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Stable getters for ReactFlow state (used by undo/redo handlers)
  const getNodes = React.useCallback(() => rfInstance?.getNodes() ?? [], [rfInstance]);
  const getEdges = React.useCallback(() => rfInstance?.getEdges() ?? [], [rfInstance]);

  // Graph handlers using context
  const {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo,
    recordPropertyEdit
  } = useGraphHandlersWithContext({
    getNodes,
    getEdges,
    addNode: addNodeDirect as (element: unknown) => void,
    addEdge: addEdgeDirect as (element: unknown) => void,
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
    renameNodeInGraph,
    state.customIcons,
    updateNodeData,
    refreshEditorData
  );
  const linkEditorHandlers = useLinkEditorHandlers(editEdge, editingLinkData, recordPropertyEdit, {
    edgeAnnotations: state.edgeAnnotations,
    setEdgeAnnotations
  });
  const networkEditorHandlers = useNetworkEditorHandlers(
    editNetwork,
    editingNetworkData,
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

  // Graph creation (edge, node, network) - composed hook using rfInstance
  const graphCreation = useGraphCreation({
    rfInstance,
    floatingPanelRef,
    state: {
      mode: state.mode,
      isLocked: state.isLocked,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      nodes: (rfInstance?.getNodes() as import("../shared/types/graph").TopoNode[]) || []
    },
    onEdgeCreated: handleEdgeCreated,
    onNodeCreated: handleNodeCreatedCallback,
    addNode: addNodeDirect as (element: import("../shared/types/graph").TopoNode) => void,
    onNewCustomNode: customNodeCommands.onNewCustomNode
  });

  // E2E testing exposure (consolidated hook) - must be after graphCreation
  useE2ETestingExposure({
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
    elements: [], // Empty for now - will be fixed in Phase 2
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
  const { handleLockedDrag, handleMoveComplete, handleDeselectAll } = useAppHandlers({
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge },
    undoRedo,
    floatingPanelRef,
    isLocked: state.isLocked,
    pendingMembershipChangesRef
  });

  // Context menus
  const { menuState, menuItems, closeMenu } = useContextMenu({
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
  useNodeDragging({
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedDrag: handleLockedDrag,
    onMoveComplete: handleMoveComplete,
    onPositionsCommitted: (positions: import("./hooks/state/useUndoRedo").NodePositionEntry[]) => {
      const withPosition = filterEntriesWithPosition(positions);
      if (withPosition.length > 0) updateNodePositions(withPosition);
    }
  });

  // Alt+Click delete and Shift+Click edge creation are now handled by ReactFlow callbacks
  // in the ReactFlowCanvas component

  // shapeLayerNode is passed as prop from App wrapper
  const shortcutDisplay = useShortcutDisplay();
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Clipboard handlers
  const clipboardHandlers = useClipboardHandlers({
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
      handleAddGroupWithUndo: annotations.handleAddGroupWithUndo
    },
    clipboardHandlers,
    deleteHandlers: {
      handleDeleteNodeWithUndo,
      handleDeleteLinkWithUndo
    },
    handleDeselectAll
  });

  const easterEgg = useEasterEgg({});

  // Annotation handlers for ReactFlowCanvas (node-to-group reparenting)
  const canvasAnnotationHandlers = React.useMemo(
    () => ({
      onNodeDropped: annotations.onNodeDropped
    }),
    [annotations.onNodeDropped]
  );

  // Annotation layer props
  const { groupLayerProps, freeTextLayerProps, freeShapeLayerProps } = useAnnotationLayerProps({
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
        <ReactFlowCanvas
          ref={reactFlowRef}
          nodes={filteredNodes as TopoNode[]}
          edges={filteredEdges as TopoEdge[]}
          linkLabelMode={state.linkLabelMode}
          onMoveComplete={(before, after) => {
            undoRedo.pushAction({ type: "move", before, after });
          }}
          onInit={onInit}
          onEdgeCreated={handleEdgeCreated}
          annotationHandlers={
            canvasAnnotationHandlers as import("./components/react-flow-canvas/types").AnnotationHandlers
          }
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
            onClose: panelVisibility.handleCloseFindNode
          }}
          svgExport={{
            isVisible: panelVisibility.showSvgExportPanel,
            onClose: panelVisibility.handleCloseSvgExport,
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
            onClose: () => setShowBulkLinkPanel(false),
            recordGraphChanges,
            addEdge: addEdgeDirect as (element: unknown) => void
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
        <EasterEggRenderer easterEgg={easterEgg} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
};

/** Main App component with providers */
export const App: React.FC = () => {
  const { state } = useTopoViewerState();
  const { updateNodePositions } = useTopoViewerActions();

  // ReactFlow canvas ref and instance
  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);

  // Track ReactFlow instance in state so updates trigger re-renders
  // This ensures ViewportProvider gets the instance after initialization
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);

  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());

  // Shape and text layers (legacy compatibility - rendered as React components)
  const { shapeLayerNode } = useShapeLayer();
  const { textLayerNode } = useTextLayer();

  // Layout controls
  const layoutControls = useLayoutControls(
    reactFlowRef as unknown as React.RefObject<import("./hooks/useAppState").CanvasRef | null>,
    null
  );

  // Geo map (disabled - requires full reimplementation)
  const { mapLibreState } = useGeoMap({
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  return (
    <ViewportProvider rfInstance={rfInstance}>
      <UndoRedoProvider enabled={state.mode === "edit"}>
        <AnnotationProvider
          nodes={state.nodes}
          rfInstance={rfInstance}
          mode={state.mode}
          isLocked={state.isLocked}
          onLockedAction={() => floatingPanelRef.current?.triggerShake()}
          pendingMembershipChangesRef={pendingMembershipChangesRef}
          updateNodePositions={updateNodePositions}
        >
          <AppContent
            floatingPanelRef={floatingPanelRef}
            pendingMembershipChangesRef={pendingMembershipChangesRef}
            reactFlowRef={reactFlowRef}
            rfInstance={rfInstance}
            layoutControls={layoutControls}
            mapLibreState={mapLibreState}
            shapeLayerNode={shapeLayerNode}
            textLayerNode={textLayerNode}
            onInit={setRfInstance}
          />
        </AnnotationProvider>
      </UndoRedoProvider>
    </ViewportProvider>
  );
};
