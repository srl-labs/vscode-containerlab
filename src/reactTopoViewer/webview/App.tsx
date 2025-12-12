/**
 * React TopoViewer Main Application Component
 */
import React from 'react';
import { ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import { useTopoViewer, CustomNodeTemplate } from './context/TopoViewerContext';
import { Navbar } from './components/navbar/Navbar';
import { ReactFlowCanvas } from './components/react-flow-canvas';
import { NodeInfoPanel } from './components/panels/NodeInfoPanel';
import { LinkInfoPanel } from './components/panels/LinkInfoPanel';
import { NodeEditorPanel } from './components/panels/node-editor';
import { LinkEditorPanel, LinkEditorData } from './components/panels/link-editor';
import { FloatingActionPanel, FloatingActionPanelHandle } from './components/panels/FloatingActionPanel';
import { ShortcutsPanel } from './components/panels/ShortcutsPanel';
import { AboutPanel } from './components/panels/AboutPanel';
import { BulkLinkPanel } from './components/panels/bulk-link';
import { ShortcutDisplay } from './components/ShortcutDisplay';
// Annotations are now rendered as React Flow nodes, these components may be removed later
// import { FreeTextLayer, FreeShapeLayer, GroupLayer } from './components/annotations';
import { FreeTextEditorPanel } from './components/panels/free-text-editor';
import { FreeShapeEditorPanel } from './components/panels/free-shape-editor';
import { GroupEditorPanel } from './components/panels/group-editor';
import {
  // State hooks
  useGraphUndoRedoHandlers,
  useCustomTemplateEditor,
  // Annotation hooks
  useAppFreeTextAnnotations,
  useAppFreeShapeAnnotations,
  useFreeShapeAnnotationApplier,
  useFreeShapeUndoRedoHandlers,
  useCombinedAnnotationShortcuts,
  useAddShapesHandler,
  // Group hooks
  useAppGroups,
  useCombinedAnnotationApplier,
  useAppGroupUndoHandlers,
  // UI hooks
  useKeyboardShortcuts,
  useShortcutDisplay,
  useCustomNodeCommands,
  useAppHandlers,
  // React Flow state hooks
  useReactFlowInstance,
  useRFSelectionData,
  useRFNavbarActions,
  useRFContextMenuHandlers,
  useRFLayoutControls,
  useNavbarCommands,
  usePanelVisibility,
  useFloatingPanelCommands
} from './hooks';
import type { GraphChangeEntry } from './hooks';
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
 * Hook for node creation handlers (React Flow version)
 */
function useNodeCreationHandlers(
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>,
  state: NodeCreationState,
  rfInstance: ReactFlowInstance | null,
  onNewCustomNode: () => void
) {
  // Handler for Add Node button from FloatingActionPanel
  const handleAddNodeFromPanel = React.useCallback((templateName?: string) => {
    // Handle "New Custom Node" action
    if (templateName === '__new__') {
      onNewCustomNode();
      return;
    }

    if (!rfInstance) return;

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

    // Get viewport center for node placement
    const viewport = rfInstance.getViewport();
    const { width, height } = rfInstance.getViewportDimensions?.() ?? { width: 800, height: 600 };
    const position: Position = {
      x: -viewport.x / viewport.zoom + width / (2 * viewport.zoom),
      y: -viewport.y / viewport.zoom + height / (2 * viewport.zoom)
    };

    // Send node creation command to extension for YAML file update
    sendCommandToExtension('create-node', {
      position,
      template: template ? {
        name: template.name,
        kind: template.kind,
        topoViewerRole: template.topoViewerRole,
        interfacePattern: template.interfacePattern
      } : undefined
    });
  }, [rfInstance, state.isLocked, state.customNodes, state.defaultNode, floatingPanelRef, onNewCustomNode]);

  return { handleAddNodeFromPanel };
}

/**
 * Determines if an info panel should be visible (only in view mode)
 */
function shouldShowInfoPanel(selectedItem: string | null, mode: 'edit' | 'view'): boolean {
  return !!selectedItem && mode === 'view';
}

const AppContent: React.FC = () => {
  const { state, initLoading, error, selectNode, selectEdge, editNode, editEdge, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate } = useTopoViewer();

  // React Flow instance management
  const { reactFlowRef, rfInstance } = useReactFlowInstance(state.elements);
  const layoutControls = useRFLayoutControls(reactFlowRef, rfInstance);

  // Ref for FloatingActionPanel to trigger shake animation
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);

  // Selection and editing data
  const { selectedNodeData, selectedLinkData } = useRFSelectionData(reactFlowRef, state.selectedNode, state.selectedEdge);
  const { selectedNodeData: editingNodeRawData } = useRFSelectionData(reactFlowRef, state.editingNode, null);
  const { selectedLinkData: editingLinkRawData } = useRFSelectionData(reactFlowRef, null, state.editingEdge);
  const editingNodeData = React.useMemo(() => convertToEditorData(editingNodeRawData), [editingNodeRawData]);
  const editingLinkData = React.useMemo(() => convertToLinkEditorData(editingLinkRawData), [editingLinkRawData]);

  // Navbar actions
  const { handleZoomToFit } = useRFNavbarActions(reactFlowRef);
  const navbarCommands = useNavbarCommands();

  // Context menu handlers
  const menuHandlers = useRFContextMenuHandlers(reactFlowRef, { selectNode, selectEdge, editNode, editEdge, removeNodeAndEdges, removeEdge });
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Free text annotations (passing null for cyInstance since React Flow handles this differently)
  const freeTextAnnotations = useAppFreeTextAnnotations({
    cyInstance: null,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  // Free shape annotations (passing null for cyInstance since React Flow handles this differently)
  const freeShapeAnnotations = useAppFreeShapeAnnotations({
    cyInstance: null,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  const { isApplyingAnnotationUndoRedo, applyAnnotationChange: applyFreeShapeChange } =
    useFreeShapeAnnotationApplier(freeShapeAnnotations);

  // Groups (passing null for cyInstance since React Flow handles this differently)
  const { groups } = useAppGroups({
    cyInstance: null,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  // Combined annotation change handler for undo/redo (freeShape + group)
  const { applyAnnotationChange } = useCombinedAnnotationApplier({
    groups,
    applyFreeShapeChange
  });

  const {
    undoRedo,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo,
    recordPropertyEdit
  } = useGraphUndoRedoHandlers({
    cyInstance: null, // React Flow handles this differently
    mode: state.mode,
    addNode,
    addEdge,
    menuHandlers,
    applyAnnotationChange
  });

  // Group undo/redo handlers (must be after useGraphUndoRedoHandlers)
  const { handleAddGroupWithUndo } = useAppGroupUndoHandlers({
    cyInstance: null, // React Flow handles this differently
    groups,
    undoRedo
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

  // Copy/paste functionality - temporarily disabled for React Flow migration
  const copyPaste = {
    handleCopy: () => {},
    handlePaste: () => {},
    handleCut: () => {},
    handleDuplicate: () => {}
  };

  // Custom template editor data and handlers
  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  // Edge creation is now handled by React Flow's onConnect callback in ReactFlowCanvas

  // Node creation state for the handler hook
  const nodeCreationState: NodeCreationState = {
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode
  };

  // Use the node creation handler hook (React Flow version)
  const { handleAddNodeFromPanel } = useNodeCreationHandlers(
    floatingPanelRef, nodeCreationState, rfInstance, customNodeCommands.onNewCustomNode
  );

  // App-level handlers for drag, deselect, and lock state sync
  const { handleDeselectAll } = useAppHandlers({
    selectionCallbacks: { selectNode, selectEdge, editNode, editEdge },
    undoRedo,
    floatingPanelRef,
    isLocked: state.isLocked
  });

  // Context menus are now handled via React Flow's onNodeContextMenu/onEdgeContextMenu
  // Node dragging is now handled by React Flow's built-in dragging
  // Group reparenting is now handled via React Flow's parentNode property
  // Group layers are now rendered as React Flow nodes, no separate layer needed

  // Shortcut display hook
  const shortcutDisplay = useShortcutDisplay();

  // Panel visibility management
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Annotation effects are now handled by React Flow's node system
  // The useAnnotationEffects hook is no longer needed since annotations are React Flow nodes

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
    cyInstance: null, // React Flow handles this differently
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
        onLabSettings={navbarCommands.onLabSettings}
        onToggleSplit={navbarCommands.onToggleSplit}
        onFindNode={navbarCommands.onFindNode}
        onCaptureViewport={navbarCommands.onCaptureSvg}
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
        <ReactFlowCanvas ref={reactFlowRef} elements={state.elements} />
        {/* Group, FreeText, and FreeShape layers are now rendered as React Flow nodes */}
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
          cy={null}
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
      </main>
    </div>
  );
};

/**
 * App component wrapped with ReactFlowProvider
 */
export const App: React.FC = () => {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
};
