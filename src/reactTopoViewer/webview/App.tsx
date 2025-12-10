/**
 * React TopoViewer Main Application Component
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useTopoViewer, CustomNodeTemplate } from './context/TopoViewerContext';
import type { CyElement } from '../shared/types/messages';
import { Navbar } from './components/navbar/Navbar';
import { CytoscapeCanvas } from './components/canvas/CytoscapeCanvas';
import { NodeInfoPanel } from './components/panels/NodeInfoPanel';
import { LinkInfoPanel } from './components/panels/LinkInfoPanel';
import { NodeEditorPanel, NodeEditorData } from './components/panels/node-editor';
import { LinkEditorPanel, LinkEditorData } from './components/panels/link-editor';
import { FloatingActionPanel, FloatingActionPanelHandle } from './components/panels/FloatingActionPanel';
import { useContextMenu } from './hooks/useContextMenu';
import { useNodeDragging } from './hooks/useNodeDragging';
import { useEdgeCreation } from './hooks/useEdgeCreation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { NodePositionEntry } from './hooks/useUndoRedo';
import { useGraphUndoRedoHandlers } from './hooks/useGraphUndoRedoHandlers';
import { useNodeCreation } from './hooks/useNodeCreation';
import {
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useContextMenuHandlers,
  useLayoutControls
} from './hooks/useAppState';
import { sendCommandToExtension } from './utils/extensionMessaging';

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
  const onShowShortcuts = React.useCallback(() => sendCommandToExtension('nav-show-shortcuts'), []);
  const onShowAbout = React.useCallback(() => sendCommandToExtension('nav-show-about'), []);
  const onLayoutToggle = React.useCallback(() => {
    sendCommandToExtension('nav-layout-toggle');
  }, []);

  return {
    onLabSettings,
    onToggleSplit,
    onFindNode,
    onCaptureSvg,
    onShowShortcuts,
    onShowAbout,
    onLayoutToggle
  };
}

function useFloatingPanelCommands() {
  const onDeploy = React.useCallback(() => sendCommandToExtension('deployLab'), []);
  const onDeployCleanup = React.useCallback(() => sendCommandToExtension('deployLabCleanup'), []);
  const onDestroy = React.useCallback(() => sendCommandToExtension('destroyLab'), []);
  const onDestroyCleanup = React.useCallback(() => sendCommandToExtension('destroyLabCleanup'), []);
  const onRedeploy = React.useCallback(() => sendCommandToExtension('redeployLab'), []);
  const onRedeployCleanup = React.useCallback(() => sendCommandToExtension('redeployLabCleanup'), []);
  const onAddNode = React.useCallback((kind?: string) => {
    sendCommandToExtension('panel-add-node', { kind });
  }, []);
  const onAddNetwork = React.useCallback((networkType?: string) => {
    sendCommandToExtension('panel-add-network', { networkType: networkType || 'host' });
  }, []);
  const onAddGroup = React.useCallback(() => sendCommandToExtension('panel-add-group'), []);
  const onAddText = React.useCallback(() => sendCommandToExtension('panel-add-text'), []);
  const onAddShapes = React.useCallback((shapeType?: string) => {
    sendCommandToExtension('panel-add-shapes', { shapeType: shapeType || 'rectangle' });
  }, []);
  const onAddBulkLink = React.useCallback(() => sendCommandToExtension('panel-add-bulk-link'), []);

  return {
    onDeploy,
    onDeployCleanup,
    onDestroy,
    onDestroyCleanup,
    onRedeploy,
    onRedeployCleanup,
    onAddNode,
    onAddNetwork,
    onAddGroup,
    onAddText,
    onAddShapes,
    onAddBulkLink
  };
}

/**
 * Converts raw node data to editor format
 */
function convertToEditorData(rawData: Record<string, unknown> | null): NodeEditorData | null {
  if (!rawData) return null;
  const extra = (rawData.extraData as Record<string, unknown>) || {};
  return {
    id: rawData.id as string || '',
    name: rawData.name as string || rawData.id as string || '',
    kind: extra.kind as string || '',
    type: extra.type as string || '',
    image: extra.image as string || '',
    icon: rawData.topoViewerRole as string || '',
    labels: (extra.labels as Record<string, string>) || {}
  };
}

/**
 * Hook for node editor handlers
 */
function useNodeEditorHandlers(editNode: (id: string | null) => void) {
  const handleClose = React.useCallback(() => {
    editNode(null);
  }, [editNode]);

  const handleSave = React.useCallback((data: NodeEditorData) => {
    sendCommandToExtension('save-node-editor', { nodeData: data });
    editNode(null);
  }, [editNode]);

  const handleApply = React.useCallback((data: NodeEditorData) => {
    sendCommandToExtension('apply-node-editor', { nodeData: data });
  }, []);

  return { handleClose, handleSave, handleApply };
}

/**
 * Converts raw link data to editor format
 */
function convertToLinkEditorData(rawData: Record<string, unknown> | null): LinkEditorData | null {
  if (!rawData) return null;
  return {
    id: rawData.id as string || '',
    source: rawData.source as string || '',
    target: rawData.target as string || '',
    sourceEndpoint: rawData.sourceEndpoint as string || '',
    targetEndpoint: rawData.targetEndpoint as string || '',
    type: rawData.linkType as string || 'veth',
    sourceMac: (rawData.endpointA as Record<string, unknown>)?.mac as string || '',
    targetMac: (rawData.endpointB as Record<string, unknown>)?.mac as string || '',
    mtu: rawData.mtu as number | undefined,
    vars: (rawData.vars as Record<string, string>) || {},
    labels: (rawData.labels as Record<string, string>) || {}
  };
}

/**
 * Hook for link editor handlers
 */
function useLinkEditorHandlers(editEdge: (id: string | null) => void) {
  const handleClose = React.useCallback(() => {
    editEdge(null);
  }, [editEdge]);

  const handleSave = React.useCallback((data: LinkEditorData) => {
    sendCommandToExtension('save-link-editor', { linkData: data });
    editEdge(null);
  }, [editEdge]);

  const handleApply = React.useCallback((data: LinkEditorData) => {
    sendCommandToExtension('apply-link-editor', { linkData: data });
  }, []);

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
  addNode: (node: CyElement) => void,
  editNode: (id: string | null) => void,
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>,
  state: NodeCreationState,
  cyInstance: CyCore | null,
  createNodeAtPosition: (position: Position, template?: CustomNodeTemplate) => void
) {
  // Handler for Add Node button from FloatingActionPanel
  const handleAddNodeFromPanel = React.useCallback((templateName?: string) => {
    if (!cyInstance) return;

    if (state.isLocked) {
      floatingPanelRef.current?.triggerShake();
      return;
    }

    let template: CustomNodeTemplate | undefined;
    if (templateName === '__new__') {
      sendCommandToExtension('panel-add-node', { kind: '__new__' });
      return;
    } else if (templateName) {
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
  }, [cyInstance, state.isLocked, state.customNodes, state.defaultNode, createNodeAtPosition, floatingPanelRef]);

  return { handleAddNodeFromPanel };
}

export const App: React.FC = () => {
  const { state, initLoading, error, selectNode, selectEdge, editNode, editEdge, addNode, addEdge, removeNodeAndEdges, removeEdge } = useTopoViewer();

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
  const nodeEditorHandlers = useNodeEditorHandlers(editNode);
  const linkEditorHandlers = useLinkEditorHandlers(editEdge);

  const {
    undoRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo
  } = useGraphUndoRedoHandlers({
    cyInstance,
    mode: state.mode,
    addNode,
    addEdge,
    menuHandlers
  });

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
    addNode, editNode, floatingPanelRef, nodeCreationState, cyInstance, createNodeAtPosition
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
    canRedo: undoRedo.canRedo
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
        onShowShortcuts={navbarCommands.onShowShortcuts}
        onShowAbout={navbarCommands.onShowAbout}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={undoRedo.undo}
        onRedo={undoRedo.redo}
      />
      <main className="topoviewer-main">
        <CytoscapeCanvas ref={cytoscapeRef} elements={state.elements} />
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
          onAddText={floatingPanelCommands.onAddText}
          onAddShapes={floatingPanelCommands.onAddShapes}
          onAddBulkLink={floatingPanelCommands.onAddBulkLink}
        />
      </main>
    </div>
  );
};
