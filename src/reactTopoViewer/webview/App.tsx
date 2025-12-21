/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import { convertToEditorData, convertToNetworkEditorData } from '../shared/utilities';
import type { CytoscapeCanvasRef } from './components/canvas/CytoscapeCanvas';

import { useTopoViewer } from './context/TopoViewerContext';
import { UndoRedoProvider, useUndoRedoContext } from './context/UndoRedoContext';
import { AnnotationProvider, useAnnotations, type PendingMembershipChange } from './context/AnnotationContext';
import { Navbar } from './components/navbar/Navbar';
import { CytoscapeCanvas } from './components/canvas/CytoscapeCanvas';
import { ShortcutDisplay } from './components/ShortcutDisplay';
import { ContextMenu } from './components/context-menu/ContextMenu';
import { FloatingActionPanel, type FloatingActionPanelHandle } from './components/panels';
import { AnnotationLayers } from './components/AnnotationLayers';
import { EditorPanels } from './components/EditorPanels';
import { ViewPanels } from './components/ViewPanels';
import { useEasterEgg, EasterEggRenderer } from './easter-eggs';
import {
  // Graph manipulation
  useNodeDragging, useEdgeCreation, useNodeCreation, useNetworkCreation,
  // State management
  useGraphHandlersWithContext, useCustomTemplateEditor,
  // Canvas/App state
  useCytoscapeInstance, useSelectionData, useNavbarActions, useContextMenuHandlers,
  useLayoutControls, useLinkLabelVisibility, useGeoMap, useUnifiedClipboard,
  assignMissingGeoCoordinatesToAnnotations, assignMissingGeoCoordinatesToShapeAnnotations,
  // Panel handlers
  useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers,
  useNodeCreationHandlers,
  // UI hooks
  useContextMenu, useFloatingPanelCommands,
  usePanelVisibility, useKeyboardShortcuts, useShortcutDisplay, useAppHandlers,
  // App helper hooks
  useCustomNodeCommands, useNavbarCommands, useShapeLayer,
  // Types
  type GraphChangeEntry
} from './hooks';
import type { NetworkType } from './hooks/graph';
import type { NodeCreationState } from './hooks/panels';
import { convertToLinkEditorData } from './utils/linkEditorConversions';
import { isServicesInitialized, getAnnotationsIO, getTopologyIO } from './services';

function LoadingState(): React.JSX.Element {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading topology...</p>
    </div>
  );
}

function ErrorState({ message }: Readonly<{ message: string }>): React.JSX.Element {
  return (
    <div className="error-container">
      <div className="error-icon">⚠️</div>
      <h2 className="text-lg font-semibold">Error Loading Topology</h2>
      <p className="text-secondary">{message}</p>
    </div>
  );
}

/** Inner component that uses contexts */
const AppContent: React.FC<{
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>;
  cyInstance: CyCore | null;
  layoutControls: ReturnType<typeof useLayoutControls>;
  mapLibreState: ReturnType<typeof useGeoMap>['mapLibreState'];
  shapeLayerNode: HTMLElement | null;
}> = ({ floatingPanelRef, pendingMembershipChangesRef, cytoscapeRef, cyInstance, layoutControls, mapLibreState, shapeLayerNode }) => {
  const { state, dispatch, selectNode, selectEdge, editNode, editEdge, editNetwork, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate, toggleLock } = useTopoViewer();
  const { undoRedo, registerGraphHandler, registerPropertyEditHandler } = useUndoRedoContext();
  const annotations = useAnnotations();

  const renameNodeInGraph = React.useCallback((oldId: string, newId: string) => {
    dispatch({ type: 'RENAME_NODE', payload: { oldId, newId } });
  }, [dispatch]);

  useLinkLabelVisibility(cyInstance, state.linkLabelMode);

  // E2E testing exposure
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      if (cyInstance) window.__DEV__.cy = cyInstance;
      window.__DEV__.isLocked = () => state.isLocked;
      window.__DEV__.setLocked = (locked: boolean) => {
        if (state.isLocked !== locked) toggleLock();
      };
    }
  }, [cyInstance, state.isLocked, toggleLock]);

  // Selection and editing data
  const { selectedNodeData, selectedLinkData } = useSelectionData(cytoscapeRef, state.selectedNode, state.selectedEdge, state.elements);
  const { selectedNodeData: editingNodeRawData } = useSelectionData(cytoscapeRef, state.editingNode, null);
  const { selectedNodeData: editingNetworkRawData } = useSelectionData(cytoscapeRef, state.editingNetwork, null);
  const { selectedLinkData: editingLinkRawData } = useSelectionData(cytoscapeRef, null, state.editingEdge);
  const editingNodeData = React.useMemo(() => convertToEditorData(editingNodeRawData), [editingNodeRawData]);
  const editingNodeInheritedProps = React.useMemo(() => {
    const extra = editingNodeRawData?.extraData as Record<string, unknown> | undefined;
    const inherited = extra?.inherited;
    return Array.isArray(inherited) ? inherited.filter((p): p is string => typeof p === 'string') : [];
  }, [editingNodeRawData]);
  const editingNetworkData = React.useMemo(() => convertToNetworkEditorData(editingNetworkRawData), [editingNetworkRawData]);
  const editingLinkData = React.useMemo(() => convertToLinkEditorData(editingLinkRawData), [editingLinkRawData]);

  // Navbar and menu handlers
  const { handleZoomToFit } = useNavbarActions(cytoscapeRef);
  const navbarCommands = useNavbarCommands();
  const menuHandlers = useContextMenuHandlers(cytoscapeRef, { selectNode, selectEdge, editNode, editEdge, editNetwork, removeNodeAndEdges, removeEdge });
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
    undoRedo,
    registerGraphHandler,
    registerPropertyEditHandler
  });

  // E2E testing exposure for undo/redo
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.undoRedo = { canUndo: undoRedo.canUndo, canRedo: undoRedo.canRedo };
      window.__DEV__.handleEdgeCreated = handleEdgeCreated;
      window.__DEV__.handleNodeCreatedCallback = handleNodeCreatedCallback;
      window.__DEV__.createGroupFromSelected = annotations.handleAddGroupWithUndo;
    }
  }, [undoRedo.canUndo, undoRedo.canRedo, handleEdgeCreated, handleNodeCreatedCallback, annotations.handleAddGroupWithUndo]);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.getReactGroups = () => annotations.groups;
      window.__DEV__.groupsCount = annotations.groups.length;
    }
  }, [annotations.groups]);

  // Geo coordinate assignment
  const geoAssignedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mapLibreState?.isInitialized || !layoutControls.isGeoLayout) {
      geoAssignedRef.current = false;
      return;
    }
    if (geoAssignedRef.current) return;
    geoAssignedRef.current = true;

    const textResult = assignMissingGeoCoordinatesToAnnotations(mapLibreState, annotations.textAnnotations);
    if (textResult.hasChanges) {
      textResult.updated.forEach(ann => {
        if (ann.geoCoordinates) annotations.updateTextGeoPosition(ann.id, ann.geoCoordinates);
      });
    }

    const shapeResult = assignMissingGeoCoordinatesToShapeAnnotations(mapLibreState, annotations.shapeAnnotations);
    if (shapeResult.hasChanges) {
      shapeResult.updated.forEach(ann => {
        if (ann.geoCoordinates) annotations.updateShapeGeoPosition(ann.id, ann.geoCoordinates);
        if ('endGeoCoordinates' in ann && ann.endGeoCoordinates) {
          annotations.updateShapeEndGeoPosition(ann.id, ann.endGeoCoordinates);
        }
      });
    }

    const groupResult = assignMissingGeoCoordinatesToAnnotations(mapLibreState, annotations.groups);
    if (groupResult.hasChanges) {
      groupResult.updated.forEach(grp => {
        if (grp.geoCoordinates) annotations.updateGroupGeoPosition(grp.id, grp.geoCoordinates);
      });
    }
  }, [mapLibreState?.isInitialized, layoutControls.isGeoLayout, annotations, mapLibreState]);

  // Editor handlers
  const nodeEditorHandlers = useNodeEditorHandlers(editNode, editingNodeData, recordPropertyEdit, cytoscapeRef, renameNodeInGraph);
  const linkEditorHandlers = useLinkEditorHandlers(editEdge, editingLinkData, recordPropertyEdit);
  const networkEditorHandlers = useNetworkEditorHandlers(editNetwork, editingNetworkData);

  const recordGraphChanges = React.useCallback((before: GraphChangeEntry[], after: GraphChangeEntry[]) => {
    undoRedo.pushAction({ type: 'graph', before, after });
  }, [undoRedo]);

  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  // Edge and node creation
  const { startEdgeCreation } = useEdgeCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onEdgeCreated: handleEdgeCreated
  });

  const handleCreateLinkFromNode = React.useCallback((nodeId: string) => {
    startEdgeCreation(nodeId);
  }, [startEdgeCreation]);

  const nodeCreationState: NodeCreationState = {
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode
  };

  const { createNodeAtPosition } = useNodeCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode,
    onNodeCreated: handleNodeCreatedCallback,
    onLockedClick: () => floatingPanelRef.current?.triggerShake()
  });

  const { handleAddNodeFromPanel } = useNodeCreationHandlers(
    floatingPanelRef, nodeCreationState, cyInstance, createNodeAtPosition, customNodeCommands.onNewCustomNode
  );

  // Network creation
  const handleNetworkCreatedCallback = React.useCallback((
    networkId: string,
    networkElement: { group: 'nodes' | 'edges'; data: Record<string, unknown>; position?: { x: number; y: number }; classes?: string },
    position: { x: number; y: number }
  ) => {
    addNode(networkElement);
    if (isServicesInitialized()) {
      const annotationsIO = getAnnotationsIO();
      const topologyIO = getTopologyIO();
      const yamlPath = topologyIO.getYamlFilePath();
      if (yamlPath) {
        void annotationsIO.modifyAnnotations(yamlPath, ann => {
          if (!ann.nodeAnnotations) ann.nodeAnnotations = [];
          ann.nodeAnnotations.push({ id: networkId, label: networkElement.data.name as string, position });
          return ann;
        });
      }
    }
  }, [addNode]);

  const { createNetworkAtPosition } = useNetworkCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onNetworkCreated: handleNetworkCreatedCallback,
    onLockedClick: () => floatingPanelRef.current?.triggerShake()
  });

  const handleAddNetworkFromPanel = React.useCallback((networkType?: string) => {
    if (!cyInstance || state.isLocked) {
      floatingPanelRef.current?.triggerShake();
      return;
    }
    const extent = cyInstance.extent();
    const position = { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
    createNetworkAtPosition(position, (networkType || 'host') as NetworkType);
  }, [cyInstance, state.isLocked, createNetworkAtPosition, floatingPanelRef]);

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
    onCreateLinkFromNode: handleCreateLinkFromNode,
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
    onMoveComplete: handleMoveComplete
  });

  // shapeLayerNode is passed as prop from App wrapper
  const shortcutDisplay = useShortcutDisplay();
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Viewport center for paste
  const getViewportCenter = React.useCallback(() => {
    if (!cyInstance) return { x: 0, y: 0 };
    const extent = cyInstance.extent();
    return { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
  }, [cyInstance]);

  // Unified clipboard
  const unifiedClipboard = useUnifiedClipboard({
    cyInstance,
    groups: annotations.groups,
    textAnnotations: annotations.textAnnotations,
    shapeAnnotations: annotations.shapeAnnotations,
    getNodeMembership: annotations.getNodeMembership,
    getGroupMembers: annotations.getGroupMembers,
    selectedGroupIds: annotations.selectedGroupIds,
    selectedTextAnnotationIds: annotations.selectedTextIds,
    selectedShapeAnnotationIds: annotations.selectedShapeIds,
    onAddGroup: annotations.addGroupWithUndo,
    onAddTextAnnotation: annotations.saveTextAnnotation,
    onAddShapeAnnotation: annotations.saveShapeAnnotation,
    onAddNodeToGroup: annotations.addNodeToGroup,
    generateGroupId: annotations.generateGroupId,
    onCreateNode: handleNodeCreatedCallback,
    onCreateEdge: handleEdgeCreated,
    beginUndoBatch: undoRedo.beginBatch,
    endUndoBatch: undoRedo.endBatch
  });

  // Combined selection IDs
  const combinedSelectedAnnotationIds = React.useMemo(() => {
    const combined = new Set<string>([...annotations.selectedTextIds, ...annotations.selectedShapeIds]);
    annotations.selectedGroupIds.forEach(id => combined.add(id));
    return combined;
  }, [annotations.selectedTextIds, annotations.selectedShapeIds, annotations.selectedGroupIds]);

  // Debounced handlers
  const lastCopyTimeRef = React.useRef(0);
  const lastPasteTimeRef = React.useRef(0);
  const lastDuplicateTimeRef = React.useRef(0);
  const DEBOUNCE_MS = 50;

  const handleUnifiedCopy = React.useCallback(() => {
    const now = Date.now();
    if (now - lastCopyTimeRef.current < DEBOUNCE_MS) return;
    lastCopyTimeRef.current = now;
    unifiedClipboard.copy();
  }, [unifiedClipboard]);

  const handleUnifiedPaste = React.useCallback(() => {
    const now = Date.now();
    if (now - lastPasteTimeRef.current < DEBOUNCE_MS) return;
    lastPasteTimeRef.current = now;
    unifiedClipboard.paste(getViewportCenter());
  }, [unifiedClipboard, getViewportCenter]);

  const handleUnifiedDuplicate = React.useCallback(() => {
    const now = Date.now();
    if (now - lastDuplicateTimeRef.current < DEBOUNCE_MS) return;
    lastDuplicateTimeRef.current = now;
    if (unifiedClipboard.copy()) unifiedClipboard.paste(getViewportCenter());
  }, [unifiedClipboard, getViewportCenter]);

  const handleUnifiedDelete = React.useCallback(() => {
    if (cyInstance) {
      cyInstance.edges(':selected').remove();
      cyInstance.nodes(':selected').remove();
    }
    annotations.deleteAllSelected();
  }, [cyInstance, annotations]);

  const handleSaveTextAnnotationWithUndo = React.useCallback((annotation: Parameters<typeof annotations.saveTextAnnotation>[0]) => {
    const isNew = annotations.editingTextAnnotation?.text === '';
    annotations.saveTextAnnotationWithUndo(annotation, isNew);
  }, [annotations]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode: state.mode,
    isLocked: state.isLocked,
    selectedNode: state.selectedNode,
    selectedEdge: state.selectedEdge,
    cyInstance,
    onDeleteNode: handleDeleteNodeWithUndo,
    onDeleteEdge: handleDeleteLinkWithUndo,
    onDeselectAll: handleDeselectAll,
    onUndo: undoRedo.undo,
    onRedo: undoRedo.redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    onCopy: handleUnifiedCopy,
    onPaste: handleUnifiedPaste,
    onDuplicate: handleUnifiedDuplicate,
    selectedAnnotationIds: combinedSelectedAnnotationIds,
    onCopyAnnotations: handleUnifiedCopy,
    onPasteAnnotations: handleUnifiedPaste,
    onDuplicateAnnotations: handleUnifiedDuplicate,
    onDeleteAnnotations: handleUnifiedDelete,
    onClearAnnotationSelection: annotations.clearAllSelections,
    hasAnnotationClipboard: unifiedClipboard.hasClipboardData,
    onCreateGroup: annotations.handleAddGroupWithUndo
  });

  const easterEgg = useEasterEgg({ cyInstance });

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
        <CytoscapeCanvas ref={cytoscapeRef} elements={state.elements} />
        <AnnotationLayers
          groupLayerProps={{
            cy: cyInstance,
            groups: annotations.groups,
            isLocked: state.isLocked,
            onGroupEdit: annotations.editGroup,
            onGroupDelete: annotations.deleteGroupWithUndo,
            onDragStart: annotations.onGroupDragStart,
            onPositionChange: annotations.onGroupDragEnd,
            onDragMove: annotations.onGroupDragMove,
            onSizeChange: annotations.updateGroupSizeWithUndo,
            selectedGroupIds: annotations.selectedGroupIds,
            onGroupSelect: annotations.selectGroup,
            onGroupToggleSelect: annotations.toggleGroupSelection,
            onGroupBoxSelect: annotations.boxSelectGroups,
            onGroupReparent: annotations.updateGroupParent,
            isGeoMode: layoutControls.isGeoLayout,
            geoMode: layoutControls.geoMode,
            mapLibreState,
            onGeoPositionChange: annotations.updateGroupGeoPosition
          }}
          freeTextLayerProps={{
            cy: cyInstance,
            annotations: annotations.textAnnotations,
            isLocked: state.isLocked,
            isAddTextMode: annotations.isAddTextMode,
            mode: state.mode,
            onAnnotationDoubleClick: annotations.editTextAnnotation,
            onAnnotationDelete: annotations.deleteTextAnnotation,
            onPositionChange: annotations.updateTextPosition,
            onRotationChange: annotations.updateTextRotation,
            onSizeChange: annotations.updateTextSize,
            onCanvasClick: annotations.handleTextCanvasClick,
            selectedAnnotationIds: annotations.selectedTextIds,
            onAnnotationSelect: annotations.selectTextAnnotation,
            onAnnotationToggleSelect: annotations.toggleTextAnnotationSelection,
            onAnnotationBoxSelect: annotations.boxSelectTextAnnotations,
            isGeoMode: layoutControls.isGeoLayout,
            geoMode: layoutControls.geoMode,
            mapLibreState,
            onGeoPositionChange: annotations.updateTextGeoPosition,
            groups: annotations.groups,
            onUpdateGroupId: (id, groupId) => annotations.updateTextAnnotation(id, { groupId })
          }}
          freeShapeLayerProps={{
            cy: cyInstance,
            annotations: annotations.shapeAnnotations,
            isLocked: state.isLocked,
            isAddShapeMode: annotations.isAddShapeMode,
            mode: state.mode,
            shapeLayerNode,
            onAnnotationEdit: annotations.editShapeAnnotation,
            onAnnotationDelete: annotations.deleteShapeAnnotationWithUndo,
            onPositionChange: annotations.updateShapePositionWithUndo,
            onRotationChange: annotations.updateShapeRotation,
            onSizeChange: annotations.updateShapeSize,
            onEndPositionChange: annotations.updateShapeEndPosition,
            onCanvasClick: annotations.handleShapeCanvasClickWithUndo,
            selectedAnnotationIds: annotations.selectedShapeIds,
            onAnnotationSelect: annotations.selectShapeAnnotation,
            onAnnotationToggleSelect: annotations.toggleShapeAnnotationSelection,
            onAnnotationBoxSelect: annotations.boxSelectShapeAnnotations,
            isGeoMode: layoutControls.isGeoLayout,
            geoMode: layoutControls.geoMode,
            mapLibreState,
            onGeoPositionChange: annotations.updateShapeGeoPosition,
            onEndGeoPositionChange: annotations.updateShapeEndGeoPosition,
            onCaptureAnnotationBefore: annotations.captureShapeAnnotationBefore,
            onFinalizeWithUndo: annotations.finalizeShapeWithUndo,
            groups: annotations.groups,
            onUpdateGroupId: (id, groupId) => annotations.updateShapeAnnotation(id, { groupId })
          }}
        />
        <ViewPanels
          nodeInfo={{ isVisible: !!state.selectedNode && state.mode === 'view', nodeData: selectedNodeData, onClose: menuHandlers.handleCloseNodePanel }}
          linkInfo={{ isVisible: !!state.selectedEdge && state.mode === 'view', linkData: selectedLinkData, onClose: menuHandlers.handleCloseLinkPanel }}
          shortcuts={{ isVisible: panelVisibility.showShortcutsPanel, onClose: panelVisibility.handleCloseShortcuts }}
          about={{ isVisible: panelVisibility.showAboutPanel, onClose: panelVisibility.handleCloseAbout }}
          findNode={{ isVisible: panelVisibility.showFindNodePanel, onClose: panelVisibility.handleCloseFindNode, cy: cyInstance }}
          svgExport={{ isVisible: panelVisibility.showSvgExportPanel, onClose: panelVisibility.handleCloseSvgExport, cy: cyInstance }}
        />
        <EditorPanels
          nodeEditor={{ isVisible: !!state.editingNode, nodeData: editingNodeData, inheritedProps: editingNodeInheritedProps, onClose: nodeEditorHandlers.handleClose, onSave: nodeEditorHandlers.handleSave, onApply: nodeEditorHandlers.handleApply }}
          networkEditor={{ isVisible: !!state.editingNetwork, nodeData: editingNetworkData, onClose: networkEditorHandlers.handleClose, onSave: networkEditorHandlers.handleSave, onApply: networkEditorHandlers.handleApply }}
          customTemplateEditor={{ isVisible: !!state.editingCustomTemplate, nodeData: customTemplateEditorData, onClose: customTemplateHandlers.handleClose, onSave: customTemplateHandlers.handleSave, onApply: customTemplateHandlers.handleApply }}
          linkEditor={{ isVisible: !!state.editingEdge, linkData: editingLinkData, onClose: linkEditorHandlers.handleClose, onSave: linkEditorHandlers.handleSave, onApply: linkEditorHandlers.handleApply }}
          bulkLink={{ isVisible: showBulkLinkPanel, mode: state.mode, isLocked: state.isLocked, cy: cyInstance, onClose: () => setShowBulkLinkPanel(false), recordGraphChanges }}
          freeTextEditor={{ isVisible: !!annotations.editingTextAnnotation, annotation: annotations.editingTextAnnotation, onSave: handleSaveTextAnnotationWithUndo, onClose: annotations.closeTextEditor, onDelete: annotations.deleteTextAnnotationWithUndo }}
          freeShapeEditor={{ isVisible: !!annotations.editingShapeAnnotation, annotation: annotations.editingShapeAnnotation, onSave: annotations.saveShapeAnnotation, onClose: annotations.closeShapeEditor, onDelete: annotations.deleteShapeAnnotation }}
          groupEditor={{ isVisible: !!annotations.editingGroup, groupData: annotations.editingGroup, onSave: annotations.saveGroup, onClose: annotations.closeGroupEditor, onDelete: annotations.deleteGroup, onStyleChange: annotations.updateGroup }}
          labSettings={{ isVisible: panelVisibility.showLabSettingsPanel, mode: state.mode, labSettings: { name: state.labName }, onClose: panelVisibility.handleCloseLabSettings }}
        />
        <FloatingActionPanel
          ref={floatingPanelRef}
          onDeploy={floatingPanelCommands.onDeploy}
          onDestroy={floatingPanelCommands.onDestroy}
          onDeployCleanup={floatingPanelCommands.onDeployCleanup}
          onDestroyCleanup={floatingPanelCommands.onDestroyCleanup}
          onRedeploy={floatingPanelCommands.onRedeploy}
          onRedeployCleanup={floatingPanelCommands.onRedeployCleanup}
          onAddNode={handleAddNodeFromPanel}
          onAddNetwork={handleAddNetworkFromPanel}
          onAddGroup={annotations.handleAddGroupWithUndo}
          onAddText={annotations.handleAddText}
          onAddShapes={annotations.handleAddShapes}
          onAddBulkLink={() => setShowBulkLinkPanel(true)}
          onEditCustomNode={customNodeCommands.onEditCustomNode}
          onDeleteCustomNode={customNodeCommands.onDeleteCustomNode}
          onSetDefaultCustomNode={customNodeCommands.onSetDefaultCustomNode}
        />
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
        <ContextMenu isVisible={menuState.isVisible} position={menuState.position} items={menuItems} onClose={closeMenu} />
        <EasterEggRenderer easterEgg={easterEgg} cyInstance={cyInstance} />
      </main>
    </div>
  );
};

/** Main App component with providers */
export const App: React.FC = () => {
  const { state, initLoading, error } = useTopoViewer();
  const { cytoscapeRef, cyInstance } = useCytoscapeInstance(state.elements);
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());
  const { shapeLayerNode } = useShapeLayer(cyInstance);
  const layoutControls = useLayoutControls(cytoscapeRef, cyInstance);
  const { mapLibreState } = useGeoMap({
    cyInstance,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  if (initLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <UndoRedoProvider cy={cyInstance} enabled={state.mode === 'edit'}>
      <AnnotationProvider
        cy={cyInstance}
        mode={state.mode}
        isLocked={state.isLocked}
        onLockedAction={() => floatingPanelRef.current?.triggerShake()}
        isGeoLayout={layoutControls.isGeoLayout}
        geoMode={layoutControls.geoMode}
        mapLibreState={mapLibreState}
        shapeLayerNode={shapeLayerNode}
        pendingMembershipChangesRef={pendingMembershipChangesRef}
      >
        <AppContent
          floatingPanelRef={floatingPanelRef}
          pendingMembershipChangesRef={pendingMembershipChangesRef}
          cytoscapeRef={cytoscapeRef}
          cyInstance={cyInstance}
          layoutControls={layoutControls}
          mapLibreState={mapLibreState}
          shapeLayerNode={shapeLayerNode}
        />
      </AnnotationProvider>
    </UndoRedoProvider>
  );
};
