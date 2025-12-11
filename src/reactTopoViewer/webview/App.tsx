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
import { ShortcutDisplay } from './components/ShortcutDisplay';
import { FreeTextLayer } from './components/annotations';
import { FreeTextEditorPanel } from './components/panels/free-text-editor';
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
  // UI hooks
  useKeyboardShortcuts,
  useShortcutDisplay,
  useCustomNodeCommands,
  // App state hooks
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useContextMenuHandlers,
  useLayoutControls
} from './hooks';
import type { NodePositionEntry, GraphChangeEntry } from './hooks';
import { sendCommandToExtension } from './utils/extensionMessaging';
import { convertToEditorData } from '../shared/utilities/nodeEditorConversions';
import type { NodeEditorData } from './components/panels/node-editor/types';

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

function useNavbarCommandCallbacks() {
  const onLabSettings = React.useCallback(() => sendCommandToExtension('nav-open-lab-settings'), []);
  const onToggleSplit = React.useCallback(() => sendCommandToExtension('topo-toggle-split-view'), []);
  const onFindNode = React.useCallback(() => sendCommandToExtension('nav-find-node'), []);
  const onCaptureSvg = React.useCallback(() => sendCommandToExtension('nav-capture-svg'), []);
  const onLayoutToggle = React.useCallback(() => {
    sendCommandToExtension('nav-layout-toggle');
  }, []);

  return {
    onLabSettings,
    onToggleSplit,
    onFindNode,
    onCaptureSvg,
    onLayoutToggle
  };
}

/**
 * Hook for managing shortcuts and about panel visibility
 */
function usePanelVisibility() {
  const [showShortcutsPanel, setShowShortcutsPanel] = React.useState(false);
  const [showAboutPanel, setShowAboutPanel] = React.useState(false);

  const handleShowShortcuts = React.useCallback(() => {
    setShowAboutPanel(false);
    setShowShortcutsPanel(prev => !prev);
  }, []);

  const handleShowAbout = React.useCallback(() => {
    setShowShortcutsPanel(false);
    setShowAboutPanel(prev => !prev);
  }, []);

  const handleCloseShortcuts = React.useCallback(() => setShowShortcutsPanel(false), []);
  const handleCloseAbout = React.useCallback(() => setShowAboutPanel(false), []);

  return {
    showShortcutsPanel,
    showAboutPanel,
    handleShowShortcuts,
    handleShowAbout,
    handleCloseShortcuts,
    handleCloseAbout
  };
}

/** Command constants to avoid duplicate strings */
const CMD_PANEL_ADD_NODE = 'panel-add-node';

/** Hook for deployment-related callbacks */
function useDeploymentCommands() {
  return {
    onDeploy: React.useCallback(() => sendCommandToExtension('deployLab'), []),
    onDeployCleanup: React.useCallback(() => sendCommandToExtension('deployLabCleanup'), []),
    onDestroy: React.useCallback(() => sendCommandToExtension('destroyLab'), []),
    onDestroyCleanup: React.useCallback(() => sendCommandToExtension('destroyLabCleanup'), []),
    onRedeploy: React.useCallback(() => sendCommandToExtension('redeployLab'), []),
    onRedeployCleanup: React.useCallback(() => sendCommandToExtension('redeployLabCleanup'), [])
  };
}

/** Hook for editor panel callbacks */
function useEditorPanelCommands() {
  return {
    onAddNode: React.useCallback((kind?: string) => {
      sendCommandToExtension(CMD_PANEL_ADD_NODE, { kind });
    }, []),
    onAddNetwork: React.useCallback((networkType?: string) => {
      sendCommandToExtension('panel-add-network', { networkType: networkType || 'host' });
    }, []),
    onAddGroup: React.useCallback(() => sendCommandToExtension('panel-add-group'), []),
    onAddText: React.useCallback(() => sendCommandToExtension('panel-add-text'), []),
    onAddShapes: React.useCallback((shapeType?: string) => {
      sendCommandToExtension('panel-add-shapes', { shapeType: shapeType || 'rectangle' });
    }, []),
    onAddBulkLink: React.useCallback(() => sendCommandToExtension('panel-add-bulk-link'), [])
  };
}

function useFloatingPanelCommands() {
  const deploymentCommands = useDeploymentCommands();
  const editorCommands = useEditorPanelCommands();

  return {
    ...deploymentCommands,
    ...editorCommands
  };
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
 * Converts raw link data to editor format
 */
function convertToLinkEditorData(rawData: Record<string, unknown> | null): LinkEditorData | null {
  if (!rawData) return null;
  const source = rawData.source as string || '';
  const target = rawData.target as string || '';
  const sourceEndpoint = rawData.sourceEndpoint as string || '';
  const targetEndpoint = rawData.targetEndpoint as string || '';

  return {
    id: rawData.id as string || '',
    source,
    target,
    sourceEndpoint,
    targetEndpoint,
    type: rawData.linkType as string || 'veth',
    sourceMac: (rawData.endpointA as Record<string, unknown>)?.mac as string || '',
    targetMac: (rawData.endpointB as Record<string, unknown>)?.mac as string || '',
    mtu: rawData.mtu as number | undefined,
    vars: (rawData.vars as Record<string, string>) || {},
    labels: (rawData.labels as Record<string, string>) || {},
    // Store original values for finding the link when endpoints change
    originalSource: source,
    originalTarget: target,
    originalSourceEndpoint: sourceEndpoint,
    originalTargetEndpoint: targetEndpoint
  };
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

export const App: React.FC = () => {
  const { state, initLoading, error, selectNode, selectEdge, editNode, editEdge, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate } = useTopoViewer();

  // Cytoscape instance management
  const { cytoscapeRef, cyInstance } = useCytoscapeInstance(state.elements);
  const layoutControls = useLayoutControls(cytoscapeRef, cyInstance);

  // Ref for FloatingActionPanel to trigger shake animation
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);

  // Selection and editing data
  const { selectedNodeData, selectedLinkData } = useSelectionData(cytoscapeRef, state.selectedNode, state.selectedEdge);
  const { selectedNodeData: editingNodeRawData } = useSelectionData(cytoscapeRef, state.editingNode, null);
  const { selectedLinkData: editingLinkRawData } = useSelectionData(cytoscapeRef, null, state.editingEdge);
  const editingNodeData = React.useMemo(() => convertToEditorData(editingNodeRawData), [editingNodeRawData]);
  const editingLinkData = React.useMemo(() => convertToLinkEditorData(editingLinkRawData), [editingLinkRawData]);

  // Navbar actions
  const { handleZoomToFit } = useNavbarActions(cytoscapeRef);
  const navbarCommands = useNavbarCommandCallbacks();

  // Context menu handlers
  const menuHandlers = useContextMenuHandlers(cytoscapeRef, { selectNode, selectEdge, editNode, editEdge, removeNodeAndEdges, removeEdge });
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

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
    menuHandlers
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

  // Set up context menus
  useContextMenu(cyInstance, {
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

  // Callback for when user tries to drag a locked node
  const handleLockedDrag = React.useCallback(() => floatingPanelRef.current?.triggerShake(), []);

  // Callback for when a node move is complete (for undo/redo)
  const handleMoveComplete = React.useCallback((nodeIds: string[], beforePositions: NodePositionEntry[]) => {
    undoRedo.recordMove(nodeIds, beforePositions);
  }, [undoRedo]);

  // Set up node dragging based on lock state
  useNodeDragging(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedDrag: handleLockedDrag,
    onMoveComplete: handleMoveComplete
  });

  // Handle deselect all callback
  const handleDeselectAll = React.useCallback(() => {
    selectNode(null);
    selectEdge(null);
    editNode(null);
    editEdge(null);
  }, [selectNode, selectEdge, editNode, editEdge]);

  // Set up keyboard shortcuts
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
    onDuplicate: copyPaste.handleDuplicate
  });

  // Shortcut display hook
  const shortcutDisplay = useShortcutDisplay();

  // Panel visibility management
  const panelVisibility = usePanelVisibility();

  // Free text annotations - using consolidated hook
  const freeTextAnnotations = useAppFreeTextAnnotations({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake()
  });

  React.useEffect(() => {
    sendCommandToExtension('toggle-lock-state', { isLocked: state.isLocked });
  }, [state.isLocked]);

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
        <CytoscapeCanvas ref={cytoscapeRef} elements={state.elements} />
        <FreeTextLayer
          cy={cyInstance}
          annotations={freeTextAnnotations.annotations}
          isLocked={state.isLocked}
          isAddTextMode={freeTextAnnotations.isAddTextMode}
          onAnnotationDoubleClick={freeTextAnnotations.editAnnotation}
          onPositionChange={freeTextAnnotations.updatePosition}
          onRotationChange={freeTextAnnotations.updateRotation}
          onSizeChange={freeTextAnnotations.updateSize}
          onCanvasClick={freeTextAnnotations.handleCanvasClick}
        />
        <NodeInfoPanel
          isVisible={!!state.selectedNode}
          nodeData={selectedNodeData}
          onClose={menuHandlers.handleCloseNodePanel}
        />
        <LinkInfoPanel
          isVisible={!!state.selectedEdge}
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
          onAddGroup={floatingPanelCommands.onAddGroup}
          onAddText={freeTextAnnotations.handleAddText}
          onAddShapes={floatingPanelCommands.onAddShapes}
          onAddBulkLink={floatingPanelCommands.onAddBulkLink}
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
        <ShortcutDisplay shortcuts={shortcutDisplay.shortcuts} />
      </main>
    </div>
  );
};
