/**
 * React TopoViewer Main Application Component
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useTopoViewer, CustomNodeTemplate } from './context/TopoViewerContext';
import { Navbar } from './components/navbar/Navbar';
import { CytoscapeCanvas } from './components/canvas/CytoscapeCanvas';
import { NodeInfoPanel } from './components/panels/NodeInfoPanel';
import { LinkInfoPanel } from './components/panels/LinkInfoPanel';
import { NodeEditorPanel } from './components/panels/node-editor';
import { LinkEditorPanel, LinkEditorData } from './components/panels/link-editor';
import { FloatingActionPanel, FloatingActionPanelHandle } from './components/panels/FloatingActionPanel';
import { ShortcutsPanel } from './components/panels/ShortcutsPanel';
import { AboutPanel } from './components/panels/AboutPanel';
import { BulkLinkPanel } from './components/panels/bulk-link';
import { FindNodePanel } from './components/panels/FindNodePanel';
import { SvgExportPanel } from './components/panels/SvgExportPanel';
import { LabSettingsPanel } from './components/panels/lab-settings';
import { ShortcutDisplay } from './components/ShortcutDisplay';
import { FreeTextLayer, FreeShapeLayer, GroupLayer } from './components/annotations';
import { ContextMenu } from './components/context-menu/ContextMenu';
import { FreeTextEditorPanel } from './components/panels/free-text-editor';
import { FreeShapeEditorPanel } from './components/panels/free-shape-editor';
import { GroupEditorPanel } from './components/panels/group-editor';
import {
  // Graph hooks
  useContextMenu,
  useNodeDragging,
  useEdgeCreation,
  useNodeCreation,
  useCopyPaste,
  // State hooks
  useGraphUndoRedoHandlers,
  useCustomTemplateEditor,
  // Annotation hooks
  useAppFreeTextAnnotations,
  useAppFreeShapeAnnotations,
  useFreeShapeAnnotationApplier,
  useFreeShapeUndoRedoHandlers,
  useCombinedAnnotationShortcuts,
  useAnnotationEffects,
  useAddShapesHandler,
  // Group hooks
  useAppGroups,
  useCombinedAnnotationApplier,
  useAppGroupUndoHandlers,
  useGroupDragUndo,
  useGroupLayer,
  useNodeReparent,
  useGroupUndoRedoHandlers,
  // UI hooks
  useKeyboardShortcuts,
  useShortcutDisplay,
  useCustomNodeCommands,
  useAppHandlers,
  // App state hooks
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useContextMenuHandlers,
  useLayoutControls,
  useNavbarCommands,
  usePanelVisibility,
  useFloatingPanelCommands,
  // Canvas hooks
  useLinkLabelVisibility,
  useGeoMap
} from './hooks';
import type { GraphChangeEntry, PendingMembershipChange } from './hooks';
import type { MembershipEntry } from './hooks/state';
import { sendCommandToExtension } from './utils/extensionMessaging';
import { convertToEditorData } from '../shared/utilities/nodeEditorConversions';
import type { NodeEditorData } from './components/panels/node-editor/types';
import { convertToLinkEditorData } from './utils/linkEditorConversions';

/**
 * Loading state component
 */
function LoadingState(): React.JSX.Element {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading topology...</p>
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ message }: Readonly<{ message: string }>): React.JSX.Element {
  return (
    <div className="error-container">
      <div className="error-icon">⚠️</div>
      <h2 className="text-lg font-semibold">Error Loading Topology</h2>
      <p className="text-secondary">{message}</p>
    </div>
  );
}

/**
 * Hook for node editor handlers with undo/redo support
 */
function useNodeEditorHandlers(
  editNode: (id: string | null) => void,
  editingNodeData: NodeEditorData | null,
  recordPropertyEdit?: (action: { entityType: 'node' | 'link'; entityId: string; before: Record<string, unknown>; after: Record<string, unknown> }) => void
) {
  // Store the initial data when editor opens for undo/redo
  const initialDataRef = React.useRef<NodeEditorData | null>(null);

  // Update initial data ref when editing node changes
  React.useEffect(() => {
    if (editingNodeData) {
      initialDataRef.current = { ...editingNodeData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingNodeData?.id]); // Only reset when editing a different node

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editNode(null);
  }, [editNode]);

  const handleSave = React.useCallback((data: NodeEditorData) => {
    // Record for undo/redo if we have initial data
    if (recordPropertyEdit && initialDataRef.current) {
      recordPropertyEdit({
        entityType: 'node',
        entityId: initialDataRef.current.id,
        before: initialDataRef.current as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>
      });
    }
    sendCommandToExtension('save-node-editor', { nodeData: data });
    initialDataRef.current = null;
    editNode(null);
  }, [editNode, recordPropertyEdit]);

  const handleApply = React.useCallback((data: NodeEditorData) => {
    // Record for undo/redo if we have initial data and data changed
    if (recordPropertyEdit && initialDataRef.current) {
      const hasChanges = JSON.stringify(initialDataRef.current) !== JSON.stringify(data);
      if (hasChanges) {
        recordPropertyEdit({
          entityType: 'node',
          entityId: initialDataRef.current.id,
          before: initialDataRef.current as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>
        });
        // Update initial data to the new state for subsequent applies
        initialDataRef.current = { ...data };
      }
    }
    sendCommandToExtension('apply-node-editor', { nodeData: data });
  }, [recordPropertyEdit]);

  return { handleClose, handleSave, handleApply };
}

/**
 * Hook for link editor handlers with undo/redo support
 */
function useLinkEditorHandlers(
  editEdge: (id: string | null) => void,
  editingLinkData: LinkEditorData | null,
  recordPropertyEdit?: (action: { entityType: 'node' | 'link'; entityId: string; before: Record<string, unknown>; after: Record<string, unknown> }) => void
) {
  // Store the initial data when editor opens for undo/redo
  const initialDataRef = React.useRef<LinkEditorData | null>(null);

  // Update initial data ref when editing link changes
  React.useEffect(() => {
    if (editingLinkData) {
      initialDataRef.current = { ...editingLinkData };
    } else {
      initialDataRef.current = null;
    }
  }, [editingLinkData?.id]); // Only reset when editing a different link

  const handleClose = React.useCallback(() => {
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge]);

  const handleSave = React.useCallback((data: LinkEditorData) => {
    // Record for undo/redo if we have initial data
    if (recordPropertyEdit && initialDataRef.current) {
      recordPropertyEdit({
        entityType: 'link',
        entityId: initialDataRef.current.id,
        before: initialDataRef.current as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>
      });
    }
    sendCommandToExtension('save-link-editor', { linkData: data });
    initialDataRef.current = null;
    editEdge(null);
  }, [editEdge, recordPropertyEdit]);

  const handleApply = React.useCallback((data: LinkEditorData) => {
    // Record for undo/redo if we have initial data and data changed
    if (recordPropertyEdit && initialDataRef.current) {
      const hasChanges = JSON.stringify(initialDataRef.current) !== JSON.stringify(data);
      if (hasChanges) {
        recordPropertyEdit({
          entityType: 'link',
          entityId: initialDataRef.current.id,
          before: initialDataRef.current as unknown as Record<string, unknown>,
          after: data as unknown as Record<string, unknown>
        });
        // Update initial data to the new state for subsequent applies
        initialDataRef.current = { ...data };
      }
    }
    sendCommandToExtension('apply-link-editor', { linkData: data });
  }, [recordPropertyEdit]);

  return { handleClose, handleSave, handleApply };
}

/** State shape for node creation handlers */
interface NodeCreationState {
  isLocked: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
}

/** Position type */
type Position = { x: number; y: number };

/**
 * Hook for node creation handlers
 */
function useNodeCreationHandlers(
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>,
  state: NodeCreationState,
  cyInstance: CyCore | null,
  createNodeAtPosition: (position: Position, template?: CustomNodeTemplate) => void,
  onNewCustomNode: () => void
) {
  // Handler for Add Node button from FloatingActionPanel
  const handleAddNodeFromPanel = React.useCallback((templateName?: string) => {
    // Handle "New Custom Node" action
    if (templateName === '__new__') {
      onNewCustomNode();
      return;
    }

    if (!cyInstance) return;

    if (state.isLocked) {
      floatingPanelRef.current?.triggerShake();
      return;
    }

    let template: CustomNodeTemplate | undefined;
    if (templateName) {
      template = state.customNodes.find(n => n.name === templateName);
    } else if (state.defaultNode) {
      template = state.customNodes.find(n => n.name === state.defaultNode);
    }

    const extent = cyInstance.extent();
    const position: Position = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };

    createNodeAtPosition(position, template);
  }, [cyInstance, state.isLocked, state.customNodes, state.defaultNode, createNodeAtPosition, floatingPanelRef, onNewCustomNode]);

  return { handleAddNodeFromPanel };
}

/**
 * Hook for membership change callbacks (reduces App complexity)
 */
function useMembershipCallbacks(
  groups: { addNodeToGroup: (nodeId: string, groupId: string) => void; removeNodeFromGroup: (nodeId: string) => void },
  pendingMembershipChangesRef: React.RefObject<Map<string, PendingMembershipChange>>
) {
  const applyMembershipChange = React.useCallback((memberships: MembershipEntry[]) => {
    for (const entry of memberships) {
      if (entry.groupId) {
        groups.addNodeToGroup(entry.nodeId, entry.groupId);
      } else {
        groups.removeNodeFromGroup(entry.nodeId);
      }
    }
  }, [groups]);

  const onMembershipWillChange = React.useCallback((nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
    pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
  }, [pendingMembershipChangesRef]);

  return { applyMembershipChange, onMembershipWillChange };
}

/**
 * Determines if an info panel should be visible (only in view mode)
 */
function shouldShowInfoPanel(selectedItem: string | null, mode: 'edit' | 'view'): boolean {
  return !!selectedItem && mode === 'view';
}

export const App: React.FC = () => {
  const { state, initLoading, error, selectNode, selectEdge, editNode, editEdge, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate } = useTopoViewer();

  // Cytoscape instance management
  const { cytoscapeRef, cyInstance } = useCytoscapeInstance(state.elements);
  const layoutControls = useLayoutControls(cytoscapeRef, cyInstance);

  // Geo map integration - manages MapLibre overlay for geographic positioning
  useGeoMap({
    cyInstance,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  // Apply link label visibility based on mode
  useLinkLabelVisibility(cyInstance, state.linkLabelMode);

  // Ref for FloatingActionPanel to trigger shake animation
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);

  // Ref to track pending membership changes during node drag (for undo/redo coordination)
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());

  // Selection and editing data
  const { selectedNodeData, selectedLinkData } = useSelectionData(cytoscapeRef, state.selectedNode, state.selectedEdge);
  const { selectedNodeData: editingNodeRawData } = useSelectionData(cytoscapeRef, state.editingNode, null);
  const { selectedLinkData: editingLinkRawData } = useSelectionData(cytoscapeRef, null, state.editingEdge);
  const editingNodeData = React.useMemo(() => convertToEditorData(editingNodeRawData), [editingNodeRawData]);
  const editingLinkData = React.useMemo(() => convertToLinkEditorData(editingLinkRawData), [editingLinkRawData]);

  // Navbar actions
  const { handleZoomToFit } = useNavbarActions(cytoscapeRef);
  const navbarCommands = useNavbarCommands();

  // Context menu handlers
  const menuHandlers = useContextMenuHandlers(cytoscapeRef, { selectNode, selectEdge, editNode, editEdge, removeNodeAndEdges, removeEdge });
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Free text annotations
  const freeTextAnnotations = useAppFreeTextAnnotations({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  // Free shape annotations
  const freeShapeAnnotations = useAppFreeShapeAnnotations({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  const { isApplyingAnnotationUndoRedo, applyAnnotationChange: applyFreeShapeChange } =
    useFreeShapeAnnotationApplier(freeShapeAnnotations);

  // Groups
  const { groups } = useAppGroups({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  // Combined annotation change handler for undo/redo (freeShape + group)
  const { applyAnnotationChange, applyGroupMoveChange } = useCombinedAnnotationApplier({
    groups,
    applyFreeShapeChange
  });

  // Membership change callbacks for undo/redo coordination
  const { applyMembershipChange, onMembershipWillChange } = useMembershipCallbacks(groups, pendingMembershipChangesRef);

  const {
    undoRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo,
    recordPropertyEdit
  } = useGraphUndoRedoHandlers({
    cyInstance,
    mode: state.mode,
    addNode,
    addEdge,
    menuHandlers,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  });

  // Group undo/redo handlers (must be after useGraphUndoRedoHandlers)
  const { handleAddGroupWithUndo, deleteGroupWithUndo } = useAppGroupUndoHandlers({
    cyInstance,
    groups,
    undoRedo
  });

  // Get isApplyingGroupUndoRedo ref from group undo handlers
  const groupUndoHandlers = useGroupUndoRedoHandlers(groups, undoRedo);

  // Group drag undo tracking - handles group + member node moves as single undo step
  const groupDragUndo = useGroupDragUndo({
    cyInstance,
    groups,
    undoRedo,
    isApplyingGroupUndoRedo: groupUndoHandlers.isApplyingGroupUndoRedo
  });

  // Editor handlers with undo/redo support
  const nodeEditorHandlers = useNodeEditorHandlers(editNode, editingNodeData, recordPropertyEdit);
  const linkEditorHandlers = useLinkEditorHandlers(editEdge, editingLinkData, recordPropertyEdit);

  // Copy/paste handler - records graph changes for undo/redo
  const recordGraphChanges = React.useCallback((before: GraphChangeEntry[], after: GraphChangeEntry[]) => {
    undoRedo.pushAction({
      type: 'graph',
      before,
      after
    });
  }, [undoRedo]);

  // Set up copy/paste functionality
  const copyPaste = useCopyPaste(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    recordGraphChanges
  });

  // Custom template editor data and handlers
  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  // Set up edge creation via edgehandles
  const { startEdgeCreation } = useEdgeCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onEdgeCreated: handleEdgeCreated
  });

  // Override the context menu handler to use the edgehandles start function
  const handleCreateLinkFromNode = React.useCallback((nodeId: string) => {
    startEdgeCreation(nodeId);
    sendCommandToExtension('panel-start-link', { nodeId });
  }, [startEdgeCreation]);

  // Get node creation callbacks using the extracted hook
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

  // Now use the extracted handler hook with the createNodeAtPosition function
  const { handleAddNodeFromPanel } = useNodeCreationHandlers(
    floatingPanelRef, nodeCreationState, cyInstance, createNodeAtPosition, customNodeCommands.onNewCustomNode
  );

  // App-level handlers for drag, deselect, and lock state sync
  const { handleLockedDrag, handleMoveComplete, handleDeselectAll } = useAppHandlers({
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge },
    undoRedo,
    floatingPanelRef,
    isLocked: state.isLocked,
    pendingMembershipChangesRef
  });

  // Set up context menus
  const { menuState, menuItems, closeMenu } = useContextMenu(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onEditNode: menuHandlers.handleEditNode,
    onDeleteNode: handleDeleteNodeWithUndo,
    onCreateLinkFromNode: handleCreateLinkFromNode,
    onEditLink: menuHandlers.handleEditLink,
    onDeleteLink: handleDeleteLinkWithUndo,
    onShowNodeProperties: menuHandlers.handleShowNodeProperties,
    onShowLinkProperties: menuHandlers.handleShowLinkProperties
  });

  // Set up node dragging based on lock state
  useNodeDragging(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedDrag: handleLockedDrag,
    onMoveComplete: handleMoveComplete
  });

  // Set up drag-to-reparent for groups (overlay-based)
  useNodeReparent(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onMembershipWillChange
  }, {
    groups: groups.groups,
    addNodeToGroup: groups.addNodeToGroup,
    removeNodeFromGroup: groups.removeNodeFromGroup
  });

  // Handlers for group dragging with undo support
  // onDragStart captures initial state, onDragEnd records compound undo action
  // onDragMove moves member nodes in real-time during drag

  // Create group background + interaction layers using cytoscape-layers
  const { backgroundLayerNode, interactionLayerNode } = useGroupLayer(cyInstance);

  // Shortcut display hook
  const shortcutDisplay = useShortcutDisplay();

  // Panel visibility management
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Combined annotation effects (group move, background clear for both text and shapes)
  useAnnotationEffects({
    cy: cyInstance,
    isLocked: state.isLocked,
    freeTextAnnotations: freeTextAnnotations.annotations,
    freeTextSelectedIds: freeTextAnnotations.selectedAnnotationIds,
    onFreeTextPositionChange: freeTextAnnotations.updatePosition,
    onFreeTextClearSelection: freeTextAnnotations.clearAnnotationSelection,
    freeShapeSelectedIds: freeShapeAnnotations.selectedAnnotationIds,
    onFreeShapeClearSelection: freeShapeAnnotations.clearAnnotationSelection
  });

  // Free shape undo handlers - extracted to useFreeShapeUndoRedoHandlers
  const freeShapeUndoHandlers = useFreeShapeUndoRedoHandlers(
    freeShapeAnnotations,
    undoRedo,
    isApplyingAnnotationUndoRedo
  );

  // Combined annotation selection + clipboard for keyboard shortcuts - extracted to useCombinedAnnotationShortcuts
  const combinedAnnotations = useCombinedAnnotationShortcuts(
    freeTextAnnotations,
    freeShapeAnnotations,
    freeShapeUndoHandlers
  );

  const handleAddShapes = useAddShapesHandler({
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake(),
    enableAddShapeMode: freeShapeAnnotations.enableAddShapeMode
  });

  // Set up keyboard shortcuts (must be after freeTextAnnotations is defined)
  useKeyboardShortcuts({
    mode: state.mode,
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
    onCopy: copyPaste.handleCopy,
    onPaste: copyPaste.handlePaste,
    onCut: copyPaste.handleCut,
    onDuplicate: copyPaste.handleDuplicate,
    selectedAnnotationIds: combinedAnnotations.selectedAnnotationIds,
    onCopyAnnotations: combinedAnnotations.copySelectedAnnotations,
    onPasteAnnotations: combinedAnnotations.pasteAnnotations,
    onCutAnnotations: combinedAnnotations.cutSelectedAnnotations,
    onDuplicateAnnotations: combinedAnnotations.duplicateSelectedAnnotations,
    onDeleteAnnotations: combinedAnnotations.deleteSelectedAnnotations,
    onClearAnnotationSelection: combinedAnnotations.clearAnnotationSelection,
    hasAnnotationClipboard: combinedAnnotations.hasAnnotationClipboard,
    onCreateGroup: handleAddGroupWithUndo
  });

  if (initLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="topoviewer-app">
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
      />
      <main className="topoviewer-main">
        <CytoscapeCanvas ref={cytoscapeRef} elements={state.elements} />
        <GroupLayer
          cy={cyInstance}
          groups={groups.groups}
          backgroundLayerNode={backgroundLayerNode}
          interactionLayerNode={interactionLayerNode}
          isLocked={state.isLocked}
          onGroupEdit={groups.editGroup}
          onGroupDelete={deleteGroupWithUndo}
          onDragStart={groupDragUndo.onGroupDragStart}
          onPositionChange={groupDragUndo.onGroupDragEnd}
          onDragMove={groupDragUndo.onGroupDragMove}
          onSizeChange={groupUndoHandlers.updateGroupSizeWithUndo}
        />
	        <FreeTextLayer
	          cy={cyInstance}
	          annotations={freeTextAnnotations.annotations}
	          isLocked={state.isLocked}
	          isAddTextMode={freeTextAnnotations.isAddTextMode}
          onAnnotationDoubleClick={freeTextAnnotations.editAnnotation}
          onAnnotationDelete={freeTextAnnotations.deleteAnnotation}
          onPositionChange={freeTextAnnotations.updatePosition}
          onRotationChange={freeTextAnnotations.updateRotation}
          onSizeChange={freeTextAnnotations.updateSize}
          onCanvasClick={freeTextAnnotations.handleCanvasClick}
          selectedAnnotationIds={freeTextAnnotations.selectedAnnotationIds}
          onAnnotationSelect={freeTextAnnotations.selectAnnotation}
	          onAnnotationToggleSelect={freeTextAnnotations.toggleAnnotationSelection}
	          onAnnotationBoxSelect={freeTextAnnotations.boxSelectAnnotations}
	        />
        <FreeShapeLayer
          cy={cyInstance}
          annotations={freeShapeAnnotations.annotations}
          isLocked={state.isLocked}
          isAddShapeMode={freeShapeAnnotations.isAddShapeMode}
          onAnnotationEdit={freeShapeAnnotations.editAnnotation}
          onAnnotationDelete={freeShapeUndoHandlers.deleteAnnotationWithUndo}
          onPositionChange={freeShapeUndoHandlers.updatePositionWithUndo}
          onRotationChange={freeShapeUndoHandlers.updateRotationWithUndo}
          onSizeChange={freeShapeUndoHandlers.updateSizeWithUndo}
          onEndPositionChange={freeShapeUndoHandlers.updateEndPositionWithUndo}
          onCanvasClick={freeShapeUndoHandlers.handleCanvasClickWithUndo}
          selectedAnnotationIds={freeShapeAnnotations.selectedAnnotationIds}
          onAnnotationSelect={freeShapeAnnotations.selectAnnotation}
          onAnnotationToggleSelect={freeShapeAnnotations.toggleAnnotationSelection}
          onAnnotationBoxSelect={freeShapeAnnotations.boxSelectAnnotations}
        />
	        <NodeInfoPanel
	          isVisible={shouldShowInfoPanel(state.selectedNode, state.mode)}
	          nodeData={selectedNodeData}
	          onClose={menuHandlers.handleCloseNodePanel}
	        />
        <LinkInfoPanel
          isVisible={shouldShowInfoPanel(state.selectedEdge, state.mode)}
          linkData={selectedLinkData}
          onClose={menuHandlers.handleCloseLinkPanel}
        />
        <NodeEditorPanel
          isVisible={!!state.editingNode}
          nodeData={editingNodeData}
          onClose={nodeEditorHandlers.handleClose}
          onSave={nodeEditorHandlers.handleSave}
          onApply={nodeEditorHandlers.handleApply}
        />
        {/* Custom Node Template Editor */}
        <NodeEditorPanel
          isVisible={!!state.editingCustomTemplate}
          nodeData={customTemplateEditorData}
          onClose={customTemplateHandlers.handleClose}
          onSave={customTemplateHandlers.handleSave}
          onApply={customTemplateHandlers.handleApply}
        />
        <LinkEditorPanel
          isVisible={!!state.editingEdge}
          linkData={editingLinkData}
          onClose={linkEditorHandlers.handleClose}
          onSave={linkEditorHandlers.handleSave}
          onApply={linkEditorHandlers.handleApply}
        />
        <BulkLinkPanel
          isVisible={showBulkLinkPanel}
          mode={state.mode}
          isLocked={state.isLocked}
          cy={cyInstance}
          onClose={() => setShowBulkLinkPanel(false)}
          recordGraphChanges={recordGraphChanges}
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
          onAddNetwork={floatingPanelCommands.onAddNetwork}
          onAddGroup={handleAddGroupWithUndo}
          onAddText={freeTextAnnotations.handleAddText}
          onAddShapes={handleAddShapes}
          onAddBulkLink={() => setShowBulkLinkPanel(true)}
          onEditCustomNode={customNodeCommands.onEditCustomNode}
          onDeleteCustomNode={customNodeCommands.onDeleteCustomNode}
          onSetDefaultCustomNode={customNodeCommands.onSetDefaultCustomNode}
        />
        <ShortcutsPanel
          isVisible={panelVisibility.showShortcutsPanel}
          onClose={panelVisibility.handleCloseShortcuts}
        />
        <AboutPanel
          isVisible={panelVisibility.showAboutPanel}
          onClose={panelVisibility.handleCloseAbout}
        />
        <FindNodePanel
          isVisible={panelVisibility.showFindNodePanel}
          onClose={panelVisibility.handleCloseFindNode}
          cy={cyInstance}
        />
        <SvgExportPanel
          isVisible={panelVisibility.showSvgExportPanel}
          onClose={panelVisibility.handleCloseSvgExport}
          cy={cyInstance}
        />
        <LabSettingsPanel
          isVisible={panelVisibility.showLabSettingsPanel}
          onClose={panelVisibility.handleCloseLabSettings}
          mode={state.mode}
          labSettings={{ name: state.labName }}
        />
        <FreeTextEditorPanel
          isVisible={!!freeTextAnnotations.editingAnnotation}
          annotation={freeTextAnnotations.editingAnnotation}
          onSave={freeTextAnnotations.saveAnnotation}
          onClose={freeTextAnnotations.closeEditor}
          onDelete={freeTextAnnotations.deleteAnnotation}
        />
        <FreeShapeEditorPanel
          isVisible={!!freeShapeAnnotations.editingAnnotation}
          annotation={freeShapeAnnotations.editingAnnotation}
          onSave={freeShapeAnnotations.saveAnnotation}
          onClose={freeShapeAnnotations.closeEditor}
          onDelete={freeShapeAnnotations.deleteAnnotation}
        />
        <GroupEditorPanel
          isVisible={!!groups.editingGroup}
          groupData={groups.editingGroup}
          onSave={groups.saveGroup}
          onClose={groups.closeEditor}
          onDelete={groups.deleteGroup}
          onStyleChange={groups.updateGroup}
        />
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
        <ContextMenu
          isVisible={menuState.isVisible}
          position={menuState.position}
          items={menuItems}
          onClose={closeMenu}
        />
      </main>
    </div>
  );
};
