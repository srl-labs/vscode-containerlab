/**
 * React TopoViewer Main Application Component
 */
import React from 'react';
import { ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import { useTopoViewer, CustomNodeTemplate } from './context/TopoViewerContext';
import { Navbar } from './components/navbar/Navbar';
import { ReactFlowCanvas } from './components/react-flow-canvas';
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
  elements: import('../../shared/types/messages').CyElement[];
}

/** Position type */
type Position = { x: number; y: number };

/**
 * Generate a unique node name based on base name and existing nodes
 */
function generateUniqueNodeName(baseName: string, existingNodes: Set<string>): string {
  if (!existingNodes.has(baseName)) return baseName;
  let counter = 1;
  let candidateName = `${baseName}${counter}`;
  while (existingNodes.has(candidateName)) {
    counter++;
    candidateName = `${baseName}${counter}`;
  }
  return candidateName;
}

/** Extract existing node names from elements */
function getExistingNodeNames(elements: NodeCreationState['elements']): Set<string> {
  const existingNodes = new Set<string>();
  for (const el of elements) {
    if (el.group === 'nodes') {
      const nodeId = (el.data as Record<string, unknown>)?.id;
      if (typeof nodeId === 'string') existingNodes.add(nodeId);
    }
  }
  return existingNodes;
}

/** Find template by name or get default */
function findTemplate(
  templateName: string | undefined,
  customNodes: CustomNodeTemplate[],
  defaultNode: string
): CustomNodeTemplate | undefined {
  if (templateName) return customNodes.find(n => n.name === templateName);
  if (defaultNode) return customNodes.find(n => n.name === defaultNode);
  return undefined;
}

/** Calculate viewport center position */
function getViewportCenterPosition(rfInstance: ReactFlowInstance): Position {
  const viewport = rfInstance.getViewport();
  const { width, height } = (rfInstance as unknown as { getViewportDimensions?: () => { width: number; height: number } }).getViewportDimensions?.() ?? { width: 800, height: 600 };
  return {
    x: -viewport.x / viewport.zoom + width / (2 * viewport.zoom),
    y: -viewport.y / viewport.zoom + height / (2 * viewport.zoom)
  };
}

/** Build extra data from template */
function buildExtraData(template: CustomNodeTemplate | undefined): Record<string, unknown> {
  const extra: Record<string, unknown> = { kind: template?.kind || 'nokia_srlinux' };
  if (template?.type) extra.type = template.type;
  if (template?.image) extra.image = template.image;
  if (template?.interfacePattern) extra.interfacePattern = template.interfacePattern;
  return extra;
}

/** Build node data from template */
function buildNodeDataFromTemplate(nodeName: string, template: CustomNodeTemplate | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: nodeName,
    name: nodeName,
    kind: template?.kind || 'nokia_srlinux',
    extraData: buildExtraData(template)
  };
  if (template?.icon) data.topoViewerRole = template.icon;
  if (template?.iconColor) data.iconColor = template.iconColor;
  if (template?.iconCornerRadius !== undefined) data.iconCornerRadius = template.iconCornerRadius;
  return data;
}

/**
 * Hook for node creation handlers (React Flow version)
 */
function useNodeCreationHandlers(
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>,
  state: NodeCreationState,
  rfInstance: ReactFlowInstance | null,
  onNewCustomNode: () => void
) {
  const handleAddNodeFromPanel = React.useCallback((templateName?: string) => {
    if (templateName === '__new__') {
      onNewCustomNode();
      return;
    }
    if (!rfInstance) return;
    if (state.isLocked) {
      floatingPanelRef.current?.triggerShake();
      return;
    }

    const template = findTemplate(templateName, state.customNodes, state.defaultNode);
    const existingNodes = getExistingNodeNames(state.elements);
    const baseName = template?.baseName || template?.kind || 'node';
    const nodeName = generateUniqueNodeName(baseName, existingNodes);
    const position = getViewportCenterPosition(rfInstance);
    const nodeData = buildNodeDataFromTemplate(nodeName, template);

    sendCommandToExtension('create-node', { nodeId: nodeName, nodeData, position });
  }, [rfInstance, state.isLocked, state.customNodes, state.defaultNode, state.elements, floatingPanelRef, onNewCustomNode]);

  return { handleAddNodeFromPanel };
}

/** Hook to convert raw selection data to editor format */
function useEditingData(reactFlowRef: React.RefObject<unknown>, editingNode: string | null, editingEdge: string | null) {
  const { selectedNodeData: nodeRaw } = useRFSelectionData(reactFlowRef, editingNode, null);
  const { selectedLinkData: linkRaw } = useRFSelectionData(reactFlowRef, null, editingEdge);
  const nodeData = React.useMemo(() => convertToEditorData(nodeRaw), [nodeRaw]);
  const linkData = React.useMemo(() => convertToLinkEditorData(linkRaw), [linkRaw]);
  return { editingNodeData: nodeData, editingLinkData: linkData };
}

const AppContent: React.FC = () => {
  const { state, initLoading, error, selectNode, selectEdge, editNode, editEdge, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate } = useTopoViewer();

  const { reactFlowRef, rfInstance } = useReactFlowInstance(state.elements);
  const layoutControls = useRFLayoutControls(reactFlowRef, rfInstance);
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);

  const { editingNodeData, editingLinkData } = useEditingData(reactFlowRef, state.editingNode, state.editingEdge);

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
    defaultNode: state.defaultNode,
    elements: state.elements
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
