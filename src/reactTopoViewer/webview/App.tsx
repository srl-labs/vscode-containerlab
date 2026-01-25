/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 * Now uses ReactFlow as the rendering layer for rendering.
 * Graph state is managed by GraphContext (React Flow is source of truth).
 */
/* eslint-disable import-x/max-dependencies -- App.tsx is the composition root and naturally has many imports */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import { convertToEditorData, convertToNetworkEditorData } from "../shared/utilities";
import type { TopoNode, TopoEdge } from "../shared/types/graph";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../shared/types/topology";

import { ReactFlowCanvas, type ReactFlowCanvasRef } from "./components/react-flow-canvas";
import { useTopoViewerActions, useTopoViewerState } from "./context/TopoViewerContext";
import { GraphProvider, useGraph, useGraphActions } from "./context/GraphContext";
import { UndoRedoProvider, useUndoRedoContext } from "./context/UndoRedoContext";
import {
  AnnotationProvider,
  useAnnotations,
  type PendingMembershipChange
} from "./context/AnnotationContext";
import { ViewportProvider } from "./context/ViewportContext";
import { Navbar } from "./components/navbar/Navbar";
import { ShortcutDisplay } from "./components/ShortcutDisplay";
import { FloatingActionPanel, type FloatingActionPanelHandle } from "./components/panels";
import { EditorPanels } from "./components/EditorPanels";
import { ViewPanels } from "./components/ViewPanels";
import { ToastContainer, useToasts } from "./components/Toast";
import { useEasterEgg, EasterEggRenderer } from "./easter-eggs";
import {
  // State management
  useGraphHandlersWithContext,
  useCustomTemplateEditor,
  // Canvas/App state
  useLayoutControls,
  // Panel handlers
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  // UI hooks
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers,
  // App helper hooks
  useCustomNodeCommands,
  useNavbarCommands,
  useE2ETestingExposure,
  // Composed hooks
  useClipboardHandlers,
  useAppKeyboardShortcuts,
  useGraphCreation,
  // External file change
  useExternalFileChange,
  // Types
  type GraphChange
} from "./hooks/internal";
import { annotationsToNodes } from "./utils/annotationNodeConverters";
import { useAnnotationPersistence } from "./hooks/useAnnotationPersistence";
import { convertToLinkEditorData } from "./utils/linkEditorConversions";
import { saveNodePositions } from "./services";
import { buildEdgeAnnotationLookup, findEdgeAnnotationInLookup } from "./utils/edgeAnnotations";
import { parseEndpointLabelOffset } from "./utils/endpointLabelOffset";

/** Inner component that uses contexts */
const AppContent: React.FC<{
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  layoutControls: ReturnType<typeof useLayoutControls>;
  onInit: (instance: ReactFlowInstance) => void;
}> = ({
  floatingPanelRef,
  pendingMembershipChangesRef,
  reactFlowRef,
  rfInstance,
  layoutControls,
  onInit
}) => {
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
  const { addNode, addEdge, removeNodeAndEdges, removeEdge, updateNodeData, renameNode } =
    useGraphActions();

  const { undoRedo, registerGraphHandler, registerPropertyEditHandler } = useUndoRedoContext();
  const annotations = useAnnotations();

  // Persist annotation node changes to JSON file
  // This watches GraphContext for annotation node changes and saves them
  useAnnotationPersistence();

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

  // Remove handlers that also clear UI state
  const removeNodeAndEdgesWithCleanup = React.useCallback(
    (nodeId: string) => {
      removeNodeAndEdges(nodeId);
      clearSelectionForDeletedNode(nodeId);
    },
    [removeNodeAndEdges, clearSelectionForDeletedNode]
  );

  const removeEdgeWithCleanup = React.useCallback(
    (edgeId: string) => {
      removeEdge(edgeId);
      clearSelectionForDeletedEdge(edgeId);
    },
    [removeEdge, clearSelectionForDeletedEdge]
  );

  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );

  // Filter nodes/edges based on showDummyLinks setting
  const filteredNodes = React.useMemo(() => {
    if (state.showDummyLinks) return nodes;
    return nodes.filter((node) => !node.id.startsWith("dummy"));
  }, [nodes, state.showDummyLinks]);

  const filteredEdges = React.useMemo(() => {
    if (state.showDummyLinks) return edges;
    const dummyNodeIds = new Set(
      nodes.filter((node) => node.id.startsWith("dummy")).map((node) => node.id)
    );
    return edges.filter((edge) => !dummyNodeIds.has(edge.source) && !dummyNodeIds.has(edge.target));
  }, [nodes, edges, state.showDummyLinks]);

  // Selection and editing data
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
    return node?.data as Record<string, unknown> | null;
  }, [state.editingNode, nodes, state.editorDataVersion]);

  const editingNetworkRawData = React.useMemo(() => {
    if (!state.editingNetwork) return null;
    const node = nodes.find((n) => n.id === state.editingNetwork);
    return node?.data as Record<string, unknown> | null;
  }, [state.editingNetwork, nodes, state.editorDataVersion]);

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
  }, [state.editingEdge, edges, state.editorDataVersion]);

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
  const handleZoomToFit = React.useCallback(() => {
    rfInstance?.fitView({ padding: 0.1 });
  }, [rfInstance]);

  // Fit viewport on initial load
  const initialFitDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!rfInstance || initialFitDoneRef.current) return;
    initialFitDoneRef.current = true;
  }, [rfInstance]);

  const navbarCommands = useNavbarCommands();

  // Context menu handlers
  const menuHandlers = React.useMemo(
    () => ({
      handleEditNode: (nodeId: string) => editNode(nodeId),
      handleEditNetwork: (nodeId: string) => editNetwork(nodeId),
      handleDeleteNode: (nodeId: string) => {
        removeNodeAndEdgesWithCleanup(nodeId);
      },
      handleCreateLinkFromNode: (_nodeId: string) => {},
      handleEditLink: (edgeId: string) => editEdge(edgeId),
      handleDeleteLink: (edgeId: string) => {
        removeEdgeWithCleanup(edgeId);
      },
      handleShowNodeProperties: (nodeId: string) => selectNode(nodeId),
      handleShowLinkProperties: (edgeId: string) => selectEdge(edgeId),
      handleCloseNodePanel: () => selectNode(null),
      handleCloseLinkPanel: () => selectEdge(null)
    }),
    [
      editNode,
      editNetwork,
      editEdge,
      removeNodeAndEdgesWithCleanup,
      removeEdgeWithCleanup,
      selectNode,
      selectEdge
    ]
  );

  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Stable getters for ReactFlow state
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

  // Callback to update node data
  const handleUpdateNodeData = React.useCallback(
    (nodeId: string, extraData: Record<string, unknown>) => {
      updateNodeData(nodeId, extraData);
    },
    [updateNodeData]
  );

  // Editor handlers
  const nodeEditorHandlers = useNodeEditorHandlers(
    editNode,
    editingNodeData,
    recordPropertyEdit,
    renameNodeInGraph,
    state.customIcons,
    handleUpdateNodeData,
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
    handleAddGroupWithUndo: annotations.handleAddGroupWithUndo,
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
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge },
    undoRedo,
    floatingPanelRef,
    isLocked: state.isLocked,
    pendingMembershipChangesRef
  });

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

  // Annotation mode state for ReactFlowCanvas
  const annotationMode = React.useMemo(
    () => ({
      isAddTextMode: annotations.isAddTextMode,
      isAddShapeMode: annotations.isAddShapeMode,
      pendingShapeType: annotations.isAddShapeMode ? annotations.pendingShapeType : undefined
    }),
    [annotations.isAddTextMode, annotations.isAddShapeMode, annotations.pendingShapeType]
  );

  // Annotation handlers for ReactFlowCanvas
  const canvasAnnotationHandlers = React.useMemo(
    () => ({
      // Add mode handlers
      onAddTextClick: annotations.handleTextCanvasClick,
      onAddShapeClick: annotations.handleShapeCanvasClickWithUndo,
      disableAddTextMode: annotations.disableAddTextMode,
      disableAddShapeMode: annotations.disableAddShapeMode,
      // Edit handlers
      onEditFreeText: annotations.editTextAnnotation,
      onEditFreeShape: annotations.editShapeAnnotation,
      // Delete handlers
      onDeleteFreeText: annotations.deleteTextAnnotationWithUndo,
      onDeleteFreeShape: annotations.deleteShapeAnnotationWithUndo,
      // Position update handlers (for drag) - use direct update without undo spam
      onUpdateFreeTextPosition: (id: string, position: { x: number; y: number }) => {
        // Use direct update for live rendering, undo is handled separately on drag end
        annotations.updateTextAnnotation(id, { position });
      },
      onUpdateFreeShapePosition: (id: string, position: { x: number; y: number }) => {
        // Use direct update for live rendering, undo is handled separately on drag end
        annotations.updateShapeAnnotation(id, { position });
      },
      // Size update handlers (for resize)
      onUpdateFreeTextSize: annotations.updateTextSize,
      onUpdateFreeShapeSize: annotations.updateShapeSize,
      // Rotation handlers
      onUpdateFreeTextRotation: annotations.updateTextRotation,
      onUpdateFreeShapeRotation: annotations.updateShapeRotation,
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
      onUpdateGroupSize: annotations.updateGroupSizeWithUndo,
      onUpdateGroupPosition: (id: string, newPosition: { x: number; y: number }) => {
        // Only update the group position - member movement is handled by onNodeDrag in useCanvasHandlers
        // This avoids double-updates that cause React Flow "node not initialized" warnings
        annotations.updateGroup(id, { position: newPosition });
      },
      onGroupDragEnd: (groupId: string) => {
        // Save member topology node positions to file on drag end
        const memberNodeIds = annotations.getGroupMembers(groupId);
        if (memberNodeIds.length === 0) return;

        const nodePositionsToSave: Array<{ id: string; position: { x: number; y: number } }> = [];
        for (const memberId of memberNodeIds) {
          const node = nodes.find((n) => n.id === memberId);
          if (node) {
            nodePositionsToSave.push({ id: memberId, position: node.position });
          }
        }

        if (nodePositionsToSave.length > 0) {
          void saveNodePositions(nodePositionsToSave);
        }
      },
      onEditGroup: annotations.editGroup,
      onDeleteGroup: annotations.deleteGroupWithUndo,
      // Get group members (for group dragging)
      getGroupMembers: annotations.getGroupMembers
    }),
    [annotations, nodes]
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
          annotationMode={annotationMode}
          annotationHandlers={
            canvasAnnotationHandlers as import("./components/react-flow-canvas/types").AnnotationHandlers
          }
          linkLabelMode={state.linkLabelMode}
          onMoveComplete={(before, after) => {
            undoRedo.pushAction({ type: "move", before, after });
          }}
          onInit={onInit}
          onEdgeCreated={handleEdgeCreated}
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
        <EasterEggRenderer easterEgg={easterEgg} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </main>
    </div>
  );
};

/** Main App component with providers */
export const App: React.FC = () => {
  const { state } = useTopoViewerState();
  const { setEdgeAnnotations } = useTopoViewerActions();

  // Get initial data including annotations
  const initialData = (
    window as {
      __INITIAL_DATA__?: {
        nodes?: TopoNode[];
        edges?: TopoEdge[];
        freeTextAnnotations?: FreeTextAnnotation[];
        freeShapeAnnotations?: FreeShapeAnnotation[];
        groupStyleAnnotations?: GroupStyleAnnotation[];
      };
    }
  ).__INITIAL_DATA__;

  // Convert annotation arrays to React Flow nodes and combine with topology nodes
  const initialNodes = React.useMemo((): TopoNode[] => {
    const topoNodes = initialData?.nodes ?? [];
    const annotationNodes = annotationsToNodes(
      initialData?.freeTextAnnotations ?? [],
      initialData?.freeShapeAnnotations ?? [],
      initialData?.groupStyleAnnotations ?? []
    ) as TopoNode[];
    return [...topoNodes, ...annotationNodes];
  }, [
    initialData?.nodes,
    initialData?.freeTextAnnotations,
    initialData?.freeShapeAnnotations,
    initialData?.groupStyleAnnotations
  ]);

  const initialEdges = initialData?.edges ?? [];

  // ReactFlow canvas ref and instance
  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);

  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());

  // Layout controls
  const layoutControls = useLayoutControls(
    reactFlowRef as unknown as React.RefObject<import("./hooks/ui/useAppState").CanvasRef | null>
  );

  // Handle edge annotations update from GraphContext
  const handleEdgeAnnotationsUpdate = React.useCallback(
    (annotations: import("../shared/types/topology").EdgeAnnotation[]) => {
      setEdgeAnnotations(annotations);
    },
    [setEdgeAnnotations]
  );

  return (
    <GraphProvider
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      onEdgeAnnotationsUpdate={handleEdgeAnnotationsUpdate}
    >
      <GraphProviderConsumer
        state={state}
        rfInstance={rfInstance}
        setRfInstance={setRfInstance}
        floatingPanelRef={floatingPanelRef}
        pendingMembershipChangesRef={pendingMembershipChangesRef}
        layoutControls={layoutControls}
        reactFlowRef={reactFlowRef}
      />
    </GraphProvider>
  );
};

/** Intermediate component to access GraphContext for AnnotationProvider */
const GraphProviderConsumer: React.FC<{
  state: import("./context/TopoViewerContext").TopoViewerState;
  rfInstance: ReactFlowInstance | null;
  setRfInstance: (instance: ReactFlowInstance) => void;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  pendingMembershipChangesRef: React.MutableRefObject<Map<string, PendingMembershipChange>>;
  layoutControls: ReturnType<typeof useLayoutControls>;
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
}> = ({
  state,
  rfInstance,
  setRfInstance,
  floatingPanelRef,
  pendingMembershipChangesRef,
  layoutControls,
  reactFlowRef
}) => {
  const { nodes } = useGraph();
  const { updateNodePositions } = useGraphActions();

  return (
    <ViewportProvider rfInstance={rfInstance}>
      <UndoRedoProvider enabled={state.mode === "edit"}>
        <AnnotationProvider
          nodes={nodes as TopoNode[]}
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
            onInit={setRfInstance}
          />
        </AnnotationProvider>
      </UndoRedoProvider>
    </ViewportProvider>
  );
};
