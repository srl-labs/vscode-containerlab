/**
 * React TopoViewer Main Application Component
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import { convertToEditorData, convertToNetworkEditorData } from '../shared/utilities';
import type { CustomNodeTemplate, CustomTemplateEditorData } from '../shared/types/editors';
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from '../shared/utilities/customNodeConversions';

import { log } from './utils/logger';
import {
  ensureCytoscapeLayersRegistered,
  getCytoscapeLayers,
  configureLayerNode,
  type IHTMLLayer
} from './hooks/shared/cytoscapeLayers';
import { useTopoViewer } from './context/TopoViewerContext';
import { Navbar } from './components/navbar/Navbar';
import { CytoscapeCanvas } from './components/canvas/CytoscapeCanvas';
import { ShortcutDisplay } from './components/ShortcutDisplay';
import { FreeTextLayer, FreeShapeLayer, GroupLayer } from './components/annotations';
import { ContextMenu } from './components/context-menu/ContextMenu';
import {
  NodeInfoPanel, LinkInfoPanel, NodeEditorPanel, NetworkEditorPanel, LinkEditorPanel,
  FloatingActionPanel, ShortcutsPanel, AboutPanel, BulkLinkPanel, FindNodePanel,
  SvgExportPanel, LabSettingsPanel, FreeTextEditorPanel, FreeShapeEditorPanel,
  GroupEditorPanel, type FloatingActionPanelHandle
} from './components/panels';
import { useEasterEgg, EasterEggRenderer } from './easter-eggs';
import {
  // Graph manipulation
  useNodeDragging, useEdgeCreation, useNodeCreation, useNetworkCreation,
  // State management
  useGraphUndoRedoHandlers, useCustomTemplateEditor,
  // Canvas/App state
  useCytoscapeInstance, useSelectionData, useNavbarActions, useContextMenuHandlers,
  useLayoutControls, useLinkLabelVisibility, useGeoMap, useUnifiedClipboard,
  assignMissingGeoCoordinatesToAnnotations, assignMissingGeoCoordinatesToShapeAnnotations,
  // Panel handlers
  useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers,
  useNodeCreationHandlers, useMembershipCallbacks,
  // UI hooks
  useContextMenu, useFloatingPanelCommands,
  usePanelVisibility, useKeyboardShortcuts, useShortcutDisplay, useAppHandlers,
  // Group hooks
  useAppGroups,
  // Annotation hooks
  useAppFreeTextAnnotations, useFreeTextAnnotationApplier, useFreeTextUndoRedoHandlers,
  useAppFreeShapeAnnotations, useFreeShapeAnnotationApplier, useFreeShapeUndoRedoHandlers,
  useAnnotationEffects, useAddShapesHandler,
  // Types
  type GraphChangeEntry
} from './hooks';
import type { NetworkType } from './hooks/graph';
import type { NodeCreationState, PendingMembershipChange } from './hooks/panels';
import {
  useAppGroupUndoHandlers, useNodeReparent,
  useCombinedAnnotationApplier, useGroupDragUndo, useGroupUndoRedoHandlers,
  generateGroupId
} from './hooks/groups';
import { convertToLinkEditorData } from './utils/linkEditorConversions';
import { isServicesInitialized, getAnnotationsIO, getTopologyIO } from './services';
import { sendDeleteCustomNode, sendSetDefaultCustomNode, sendCommandToExtension } from './utils/extensionMessaging';

/**
 * Custom node template UI commands interface
 */
interface CustomNodeCommands {
  /** Open editor to create a new custom node template */
  onNewCustomNode: () => void;
  /** Open editor to edit an existing custom node template */
  onEditCustomNode: (nodeName: string) => void;
  /** Delete a custom node template */
  onDeleteCustomNode: (nodeName: string) => void;
  /** Set a custom node template as the default */
  onSetDefaultCustomNode: (nodeName: string) => void;
}

/**
 * Hook for custom node template UI commands
 *
 * @param customNodes - Array of custom node templates from context state
 * @param editCustomTemplate - Action to open the custom template editor (from context)
 * @returns Object with callbacks for new, edit, delete, and set-default actions
 */
function useCustomNodeCommands(
  customNodes: CustomNodeTemplate[],
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void
): CustomNodeCommands {
  const onNewCustomNode = React.useCallback(() => {
    const templateData = createNewTemplateEditorData();
    editCustomTemplate(templateData);
  }, [editCustomTemplate]);

  const onEditCustomNode = React.useCallback((nodeName: string) => {
    const template = customNodes.find(n => n.name === nodeName);
    if (!template) return;
    const templateData = convertTemplateToEditorData(template);
    editCustomTemplate(templateData);
  }, [customNodes, editCustomTemplate]);

  const onDeleteCustomNode = React.useCallback((nodeName: string) => {
    sendDeleteCustomNode(nodeName);
  }, []);

  const onSetDefaultCustomNode = React.useCallback((nodeName: string) => {
    sendSetDefaultCustomNode(nodeName);
  }, []);

  return {
    onNewCustomNode,
    onEditCustomNode,
    onDeleteCustomNode,
    onSetDefaultCustomNode
  };
}

/**
 * Navbar commands interface
 */
interface NavbarCommands {
  /** Toggle layout between cola and preset */
  onLayoutToggle: () => void;
  /** Toggle split view for YAML editor */
  onToggleSplit: () => void;
}

/**
 * Hook for navbar UI commands
 *
 * @returns Object with callbacks for navbar button actions
 */
function useNavbarCommands(): NavbarCommands {
  const onLayoutToggle = React.useCallback(() => {
    sendCommandToExtension('nav-layout-toggle');
  }, []);

  const onToggleSplit = React.useCallback(() => {
    sendCommandToExtension('topo-toggle-split-view');
  }, []);

  return {
    onLayoutToggle,
    onToggleSplit
  };
}

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
 * Determines if an info panel should be visible (only in view mode)
 */
function shouldShowInfoPanel(selectedItem: string | null, mode: 'edit' | 'view'): boolean {
  return !!selectedItem && mode === 'view';
}

interface UseShapeLayerReturn {
  /** Layer node transformed with pan/zoom, rendered BELOW nodes */
  shapeLayerNode: HTMLElement | null;
  updateLayer: () => void;
}

/**
 * Hook to create and manage a Cytoscape layer for shape annotations.
 * Uses cytoscape-layers to render shapes BELOW the node layer but above the grid.
 * Creates an HTML layer below nodes for rendering shape annotations.
 * Shapes will appear above the grid but below nodes and edges.
 */
function useShapeLayer(cy: CyCore | null): UseShapeLayerReturn {
  const layerRef = React.useRef<IHTMLLayer | null>(null);
  const [shapeLayerNode, setShapeLayerNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!cy) return;

    ensureCytoscapeLayersRegistered();

    try {
      const layers = getCytoscapeLayers(cy);
      log.info('[ShapeLayer] Creating shape layer below nodes');

      // Create layer BELOW the node layer
      const shapeLayer = layers.nodeLayer.insertBefore('html');
      layerRef.current = shapeLayer;

      // Configure the layer node
      configureLayerNode(shapeLayer.node, 'auto', 'shape-layer-container');

      log.info('[ShapeLayer] Shape layer created');
      setShapeLayerNode(shapeLayer.node);
    } catch (err) {
      log.error(`[ShapeLayer] Failed to create layer: ${err}`);
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      setShapeLayerNode(null);
    };
  }, [cy]);

  const updateLayer = () => {
    layerRef.current?.update();
  };

  return { shapeLayerNode, updateLayer };
}

export const App: React.FC = () => {
  const { state, dispatch, initLoading, error, selectNode, selectEdge, editNode, editEdge, editNetwork, addNode, addEdge, removeNodeAndEdges, removeEdge, editCustomTemplate, toggleLock } = useTopoViewer();

  // Callback to rename a node in the graph (for node editor)
  const renameNodeInGraph = React.useCallback((oldId: string, newId: string) => {
    dispatch({ type: 'RENAME_NODE', payload: { oldId, newId } });
  }, [dispatch]);

  // Cytoscape instance management
  const { cytoscapeRef, cyInstance } = useCytoscapeInstance(state.elements);
  const layoutControls = useLayoutControls(cytoscapeRef, cyInstance);

  // Geo map integration - manages MapLibre overlay for geographic positioning
  const { mapLibreState } = useGeoMap({
    cyInstance,
    isGeoLayout: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode
  });

  // Apply link label visibility based on mode
  useLinkLabelVisibility(cyInstance, state.linkLabelMode);

  // Expose cy instance and lock control for E2E testing (dev mode only)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      if (cyInstance) {
        window.__DEV__.cy = cyInstance;
      }
      window.__DEV__.isLocked = () => state.isLocked;
      window.__DEV__.setLocked = (locked: boolean) => {
        if (state.isLocked !== locked) {
          toggleLock();
        }
      };
    }
  }, [cyInstance, state.isLocked, toggleLock]);

  // Ref for FloatingActionPanel to trigger shake animation
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);

  // Ref to track pending membership changes during node drag (for undo/redo coordination)
  const pendingMembershipChangesRef = React.useRef<Map<string, PendingMembershipChange>>(new Map());

  // Selection and editing data
  // Pass state.elements as refreshTrigger so link data refreshes when edge stats update
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

  // Navbar actions
  const { handleZoomToFit } = useNavbarActions(cytoscapeRef);
  const navbarCommands = useNavbarCommands();

  // Context menu handlers
  const menuHandlers = useContextMenuHandlers(cytoscapeRef, { selectNode, selectEdge, editNode, editEdge, editNetwork, removeNodeAndEdges, removeEdge });
  const floatingPanelCommands = useFloatingPanelCommands();
  const customNodeCommands = useCustomNodeCommands(state.customNodes, editCustomTemplate);

  // Refs for late-bound migration callbacks (annotations are defined after groups)
  const migrateTextAnnotationsRef = React.useRef<((oldGroupId: string, newGroupId: string) => void) | undefined>(undefined);
  const migrateShapeAnnotationsRef = React.useRef<((oldGroupId: string, newGroupId: string) => void) | undefined>(undefined);

  // Groups - initialized before annotations so they can auto-assign groupId
  // Migration callbacks use refs because annotation hooks are defined after groups
  const { groups } = useAppGroups({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake(),
    onMigrateTextAnnotations: (old, newId) => migrateTextAnnotationsRef.current?.(old, newId),
    onMigrateShapeAnnotations: (old, newId) => migrateShapeAnnotationsRef.current?.(old, newId)
  });

  // Free text annotations - groups passed for auto-assignment when creating inside groups
  const freeTextAnnotations = useAppFreeTextAnnotations({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake(),
    groups: groups.groups
  });

  // Free shape annotations - groups passed for auto-assignment when creating inside groups
  const freeShapeAnnotations = useAppFreeShapeAnnotations({
    cyInstance,
    mode: state.mode,
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake(),
    groups: groups.groups
  });

  // Set late-bound migration callbacks now that annotation hooks are defined
  migrateTextAnnotationsRef.current = freeTextAnnotations.migrateGroupId;
  migrateShapeAnnotationsRef.current = freeShapeAnnotations.migrateGroupId;

  const { isApplyingAnnotationUndoRedo, applyAnnotationChange: applyFreeShapeChange } =
    useFreeShapeAnnotationApplier(freeShapeAnnotations);

  // Free text annotation applier for undo/redo
  const { isApplyingAnnotationUndoRedo: isApplyingTextUndoRedo, applyAnnotationChange: applyFreeTextChange } =
    useFreeTextAnnotationApplier(freeTextAnnotations);

  // Assign geo coordinates to annotations when geomap initializes
  // This runs once when the geomap becomes available and assigns lat/lng to any
  // freeText, freeShape, or group annotation that doesn't have geoCoordinates yet
  const geoAssignedRef = React.useRef(false);
  React.useEffect(() => {
    // Only run when geomap is initialized and is the active layout
    if (!mapLibreState?.isInitialized || !layoutControls.isGeoLayout) {
      // Reset flag when geomap is disabled so we reassign next time
      geoAssignedRef.current = false;
      return;
    }
    // Only assign once per geomap session
    if (geoAssignedRef.current) return;
    geoAssignedRef.current = true;

    // Assign geo coordinates to freeText annotations
    const freeTextResult = assignMissingGeoCoordinatesToAnnotations(
      mapLibreState,
      freeTextAnnotations.annotations
    );
    if (freeTextResult.hasChanges) {
      freeTextResult.updated.forEach(ann => {
        if (ann.geoCoordinates) {
          freeTextAnnotations.updateGeoPosition(ann.id, ann.geoCoordinates);
        }
      });
    }

    // Assign geo coordinates to freeShape annotations (handles both position and endPosition)
    const freeShapeResult = assignMissingGeoCoordinatesToShapeAnnotations(
      mapLibreState,
      freeShapeAnnotations.annotations
    );
    if (freeShapeResult.hasChanges) {
      freeShapeResult.updated.forEach(ann => {
        if (ann.geoCoordinates) {
          freeShapeAnnotations.updateGeoPosition(ann.id, ann.geoCoordinates);
        }
        // For line shapes, also update end geo coordinates
        if ('endGeoCoordinates' in ann && ann.endGeoCoordinates) {
          freeShapeAnnotations.updateEndGeoPosition(ann.id, ann.endGeoCoordinates);
        }
      });
    }

    // Assign geo coordinates to group annotations
    const groupResult = assignMissingGeoCoordinatesToAnnotations(
      mapLibreState,
      groups.groups
    );
    if (groupResult.hasChanges) {
      groupResult.updated.forEach(grp => {
        if (grp.geoCoordinates) {
          groups.updateGroupGeoPosition(grp.id, grp.geoCoordinates);
        }
      });
    }
  }, [
    mapLibreState?.isInitialized,
    layoutControls.isGeoLayout,
    freeTextAnnotations,
    freeShapeAnnotations,
    groups,
    mapLibreState
  ]);

  // Combined annotation change handler for undo/redo (freeText + freeShape + group)
  const { applyAnnotationChange, applyGroupMoveChange } = useCombinedAnnotationApplier({
    groups,
    applyFreeShapeChange,
    applyFreeTextChange,
    // Pass annotation update callbacks for group move undo/redo
    onUpdateTextAnnotation: freeTextAnnotations.updateAnnotation,
    onUpdateShapeAnnotation: freeShapeAnnotations.updateAnnotation
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

  // Free text undo handlers - wraps save/delete with undo recording
  const freeTextUndoHandlers = useFreeTextUndoRedoHandlers(
    freeTextAnnotations,
    undoRedo,
    isApplyingTextUndoRedo
  );

  // Expose undoRedo and handlers for E2E testing (dev mode only)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.undoRedo = {
        canUndo: undoRedo.canUndo,
        canRedo: undoRedo.canRedo
      };
      // Expose handleEdgeCreated for E2E tests to push undo actions when creating links
      window.__DEV__.handleEdgeCreated = handleEdgeCreated;
      // Expose handleNodeCreatedCallback for E2E tests to create nodes with undo support
      window.__DEV__.handleNodeCreatedCallback = handleNodeCreatedCallback;
      // Expose handleAddGroupWithUndo for E2E tests to create groups from selected nodes
      window.__DEV__.createGroupFromSelected = handleAddGroupWithUndo;
    }
  }, [undoRedo.canUndo, undoRedo.canRedo, handleEdgeCreated, handleNodeCreatedCallback, handleAddGroupWithUndo]);

  // Separate effect for groups (always update when groups change)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.getReactGroups = () => groups.groups;
      window.__DEV__.groupsCount = groups.groups.length;
    }
  }, [groups.groups]);

  // Group drag undo tracking - handles group + member node moves as single undo step
  // Also moves annotations that belong to groups
  const groupDragUndo = useGroupDragUndo({
    cyInstance,
    groups,
    undoRedo,
    isApplyingGroupUndoRedo: groupUndoHandlers.isApplyingGroupUndoRedo,
    textAnnotations: freeTextAnnotations.annotations,
    shapeAnnotations: freeShapeAnnotations.annotations,
    onUpdateTextAnnotation: freeTextAnnotations.updateAnnotation,
    onUpdateShapeAnnotation: freeShapeAnnotations.updateAnnotation
  });

  // Editor handlers with undo/redo support
  const nodeEditorHandlers = useNodeEditorHandlers(editNode, editingNodeData, recordPropertyEdit, cytoscapeRef, renameNodeInGraph);
  const linkEditorHandlers = useLinkEditorHandlers(editEdge, editingLinkData, recordPropertyEdit);
  const networkEditorHandlers = useNetworkEditorHandlers(editNetwork, editingNetworkData);

  // Copy/paste handler - records graph changes for undo/redo
  const recordGraphChanges = React.useCallback((before: GraphChangeEntry[], after: GraphChangeEntry[]) => {
    undoRedo.pushAction({
      type: 'graph',
      before,
      after
    });
  }, [undoRedo]);

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

  // Network creation callback for undo/redo support
  const handleNetworkCreatedCallback = React.useCallback((
    networkId: string,
    networkElement: { group: 'nodes' | 'edges'; data: Record<string, unknown>; position?: { x: number; y: number }; classes?: string },
    position: { x: number; y: number }
  ) => {
    // Add network to state for tracking
    addNode(networkElement);

    // Save network position to annotations
    if (isServicesInitialized()) {
      const annotationsIO = getAnnotationsIO();
      const topologyIO = getTopologyIO();
      const yamlPath = topologyIO.getYamlFilePath();
      if (yamlPath) {
        void annotationsIO.modifyAnnotations(yamlPath, annotations => {
          if (!annotations.nodeAnnotations) annotations.nodeAnnotations = [];
          annotations.nodeAnnotations.push({
            id: networkId,
            label: networkElement.data.name as string,
            position: { x: position.x, y: position.y }
          });
          return annotations;
        });
      }
    }
  }, [addNode]);

  // Set up network creation hook
  const { createNetworkAtPosition } = useNetworkCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onNetworkCreated: handleNetworkCreatedCallback,
    onLockedClick: () => floatingPanelRef.current?.triggerShake()
  });

  // Handler for Add Network button from FloatingActionPanel
  const handleAddNetworkFromPanel = React.useCallback((networkType?: string) => {
    if (!cyInstance) return;

    if (state.isLocked) {
      floatingPanelRef.current?.triggerShake();
      return;
    }

    // Get viewport center for placement
    const extent = cyInstance.extent();
    const position = {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };

    createNetworkAtPosition(position, (networkType || 'host') as NetworkType);
  }, [cyInstance, state.isLocked, createNetworkAtPosition, floatingPanelRef]);

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
    onEditNetwork: menuHandlers.handleEditNetwork,
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

  // Create shape layer below nodes using cytoscape-layers
  const { shapeLayerNode } = useShapeLayer(cyInstance);

  // Shortcut display hook
  const shortcutDisplay = useShortcutDisplay();

  // Panel visibility management
  const panelVisibility = usePanelVisibility();
  const [showBulkLinkPanel, setShowBulkLinkPanel] = React.useState(false);

  // Combined annotation effects (group move, background clear for text, shapes, and groups)
  useAnnotationEffects({
    cy: cyInstance,
    isLocked: state.isLocked,
    freeTextAnnotations: freeTextAnnotations.annotations,
    freeTextSelectedIds: freeTextAnnotations.selectedAnnotationIds,
    onFreeTextPositionChange: freeTextAnnotations.updatePosition,
    onFreeTextClearSelection: freeTextAnnotations.clearAnnotationSelection,
    freeShapeSelectedIds: freeShapeAnnotations.selectedAnnotationIds,
    onFreeShapeClearSelection: freeShapeAnnotations.clearAnnotationSelection,
    groupSelectedIds: groups.selectedGroupIds,
    onGroupClearSelection: groups.clearGroupSelection
  });

  // Free shape undo handlers - extracted to useFreeShapeUndoRedoHandlers
  const freeShapeUndoHandlers = useFreeShapeUndoRedoHandlers(
    freeShapeAnnotations,
    undoRedo,
    isApplyingAnnotationUndoRedo
  );

  // Helper to get viewport center for paste operations
  const getViewportCenter = React.useCallback(() => {
    if (!cyInstance) return { x: 0, y: 0 };
    const extent = cyInstance.extent();
    return {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2
    };
  }, [cyInstance]);

  // Generate unique group ID callback
  const generateGroupIdCallback = React.useCallback(() => {
    return generateGroupId(groups.groups);
  }, [groups.groups]);

  // Wrapper for adding groups with undo recording (for paste operations)
  // This ensures group creation is recorded in the undo stack and can be batched
  const addGroupWithUndo = React.useCallback((group: Parameters<typeof groups.addGroup>[0]) => {
    groups.addGroup(group);
    // Record undo action: before=null (didn't exist), after=group (created)
    undoRedo.pushAction(groups.getUndoRedoAction(null, group));
  }, [groups, undoRedo]);

  // Unified clipboard - handles nodes, groups, and annotations together
  const unifiedClipboard = useUnifiedClipboard({
    cyInstance,
    groups: groups.groups,
    textAnnotations: freeTextAnnotations.annotations,
    shapeAnnotations: freeShapeAnnotations.annotations,
    getNodeMembership: groups.getNodeMembership,
    getGroupMembers: groups.getGroupMembers,
    selectedGroupIds: groups.selectedGroupIds,
    selectedTextAnnotationIds: freeTextAnnotations.selectedAnnotationIds,
    selectedShapeAnnotationIds: freeShapeAnnotations.selectedAnnotationIds,
    onAddGroup: addGroupWithUndo,
    onAddTextAnnotation: freeTextAnnotations.saveAnnotation,
    onAddShapeAnnotation: freeShapeAnnotations.saveAnnotation,
    onAddNodeToGroup: groups.addNodeToGroup,
    generateGroupId: generateGroupIdCallback,
    onCreateNode: handleNodeCreatedCallback,
    onCreateEdge: handleEdgeCreated,
    beginUndoBatch: undoRedo.beginBatch,
    endUndoBatch: undoRedo.endBatch
  });

  // Combined selection IDs for keyboard shortcuts (text + shape + groups)
  const combinedSelectedAnnotationIds = React.useMemo(() => {
    const combined = new Set<string>([
      ...freeTextAnnotations.selectedAnnotationIds,
      ...freeShapeAnnotations.selectedAnnotationIds
    ]);
    groups.selectedGroupIds.forEach(id => combined.add(id));
    return combined;
  }, [freeTextAnnotations.selectedAnnotationIds, freeShapeAnnotations.selectedAnnotationIds, groups.selectedGroupIds]);

  // Refs to prevent double-calling handlers in same event (keyboard handler may call both graph and annotation handlers)
  const lastCopyTimeRef = React.useRef(0);
  const lastPasteTimeRef = React.useRef(0);
  const lastDuplicateTimeRef = React.useRef(0);
  const DEBOUNCE_MS = 50; // Prevent calls within 50ms of each other

  // Unified copy handler - copies everything selected (nodes, groups, annotations)
  const handleUnifiedCopy = React.useCallback(() => {
    const now = Date.now();
    if (now - lastCopyTimeRef.current < DEBOUNCE_MS) return;
    lastCopyTimeRef.current = now;
    unifiedClipboard.copy();
  }, [unifiedClipboard]);

  // Unified paste handler
  const handleUnifiedPaste = React.useCallback(() => {
    const now = Date.now();
    if (now - lastPasteTimeRef.current < DEBOUNCE_MS) return;
    lastPasteTimeRef.current = now;
    const center = getViewportCenter();
    unifiedClipboard.paste(center);
  }, [unifiedClipboard, getViewportCenter]);

  // Unified duplicate handler
  const handleUnifiedDuplicate = React.useCallback(() => {
    const now = Date.now();
    if (now - lastDuplicateTimeRef.current < DEBOUNCE_MS) return;
    lastDuplicateTimeRef.current = now;
    const success = unifiedClipboard.copy();
    if (success) {
      const center = getViewportCenter();
      unifiedClipboard.paste(center);
    }
  }, [unifiedClipboard, getViewportCenter]);

  // Unified delete handler
  const handleUnifiedDelete = React.useCallback(() => {
    if (cyInstance) {
      // Delete selected graph elements
      const selectedNodes = cyInstance.nodes(':selected');
      const selectedEdges = cyInstance.edges(':selected');
      selectedEdges.remove();
      selectedNodes.remove();
    }
    // Delete selected groups
    groups.selectedGroupIds.forEach(id => deleteGroupWithUndo(id));
    groups.clearGroupSelection();
    // Delete selected annotations
    freeTextAnnotations.deleteSelectedAnnotations();
    freeShapeAnnotations.deleteSelectedAnnotations();
  }, [cyInstance, groups, deleteGroupWithUndo, freeTextAnnotations, freeShapeAnnotations]);

  // Clear all selections
  const handleClearAllSelection = React.useCallback(() => {
    freeTextAnnotations.clearAnnotationSelection();
    freeShapeAnnotations.clearAnnotationSelection();
    groups.clearGroupSelection();
  }, [freeTextAnnotations, freeShapeAnnotations, groups]);

  const handleAddShapes = useAddShapesHandler({
    isLocked: state.isLocked,
    onLockedAction: () => floatingPanelRef.current?.triggerShake(),
    enableAddShapeMode: freeShapeAnnotations.enableAddShapeMode
  });

  // Wrapper for FreeTextEditorPanel's onSave to record undo actions
  // Detects if annotation is new (text was empty) vs editing existing
  const handleSaveTextAnnotationWithUndo = React.useCallback((annotation: Parameters<typeof freeTextAnnotations.saveAnnotation>[0]) => {
    // Check if this is a new annotation (editingAnnotation had empty text)
    const isNew = freeTextAnnotations.editingAnnotation?.text === '';
    freeTextUndoHandlers.saveAnnotationWithUndo(annotation, isNew);
  }, [freeTextAnnotations, freeTextUndoHandlers]);

  // Set up keyboard shortcuts with unified clipboard
  // The unified clipboard handles everything (nodes, groups, annotations) together
  // Handlers are passed to BOTH graph and annotation callbacks because:
  // - Graph callbacks trigger when cytoscape nodes are selected
  // - Annotation callbacks trigger when annotations/groups are selected
  // The handlers use debouncing to prevent double-execution in the same event
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
    // Graph clipboard handlers - unified (handles everything, debounced)
    onCopy: handleUnifiedCopy,
    onPaste: handleUnifiedPaste,
    onDuplicate: handleUnifiedDuplicate,
    // Selected annotation IDs includes groups and annotations
    selectedAnnotationIds: combinedSelectedAnnotationIds,
    // Annotation clipboard handlers - same unified handlers (debounced)
    onCopyAnnotations: handleUnifiedCopy,
    onPasteAnnotations: handleUnifiedPaste,
    onDuplicateAnnotations: handleUnifiedDuplicate,
    onDeleteAnnotations: handleUnifiedDelete,
    onClearAnnotationSelection: handleClearAllSelection,
    hasAnnotationClipboard: unifiedClipboard.hasClipboardData,
    onCreateGroup: handleAddGroupWithUndo
  });

  // Easter egg: Konami code party mode
  const easterEgg = useEasterEgg({ cyInstance });

  if (initLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

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
        <GroupLayer
          cy={cyInstance}
          groups={groups.groups}
          isLocked={state.isLocked}
          onGroupEdit={groups.editGroup}
          onGroupDelete={deleteGroupWithUndo}
          onDragStart={groupDragUndo.onGroupDragStart}
          onPositionChange={groupDragUndo.onGroupDragEnd}
          onDragMove={groupDragUndo.onGroupDragMove}
          onSizeChange={groupUndoHandlers.updateGroupSizeWithUndo}
          selectedGroupIds={groups.selectedGroupIds}
          onGroupSelect={groups.selectGroup}
          onGroupToggleSelect={groups.toggleGroupSelection}
          onGroupBoxSelect={groups.boxSelectGroups}
          onGroupReparent={groups.updateGroupParent}
          isGeoMode={layoutControls.isGeoLayout}
          geoMode={layoutControls.geoMode}
          mapLibreState={mapLibreState}
          onGeoPositionChange={groups.updateGroupGeoPosition}
        />
        <FreeTextLayer
          cy={cyInstance}
          annotations={freeTextAnnotations.annotations}
          isLocked={state.isLocked}
          isAddTextMode={freeTextAnnotations.isAddTextMode}
          mode={state.mode}
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
          isGeoMode={layoutControls.isGeoLayout}
          geoMode={layoutControls.geoMode}
          mapLibreState={mapLibreState}
          onGeoPositionChange={freeTextAnnotations.updateGeoPosition}
          groups={groups.groups}
          onUpdateGroupId={(id, groupId) => freeTextAnnotations.updateAnnotation(id, { groupId })}
        />
        <FreeShapeLayer
          cy={cyInstance}
          annotations={freeShapeAnnotations.annotations}
          isLocked={state.isLocked}
          isAddShapeMode={freeShapeAnnotations.isAddShapeMode}
          mode={state.mode}
          shapeLayerNode={shapeLayerNode}
          onAnnotationEdit={freeShapeAnnotations.editAnnotation}
          onAnnotationDelete={freeShapeUndoHandlers.deleteAnnotationWithUndo}
          onPositionChange={freeShapeUndoHandlers.updatePositionWithUndo}
          onRotationChange={freeShapeAnnotations.updateRotation}
          onSizeChange={freeShapeAnnotations.updateSize}
          onEndPositionChange={freeShapeAnnotations.updateEndPosition}
          onCanvasClick={freeShapeUndoHandlers.handleCanvasClickWithUndo}
          selectedAnnotationIds={freeShapeAnnotations.selectedAnnotationIds}
          onAnnotationSelect={freeShapeAnnotations.selectAnnotation}
          onAnnotationToggleSelect={freeShapeAnnotations.toggleAnnotationSelection}
          onAnnotationBoxSelect={freeShapeAnnotations.boxSelectAnnotations}
          isGeoMode={layoutControls.isGeoLayout}
          geoMode={layoutControls.geoMode}
          mapLibreState={mapLibreState}
          onGeoPositionChange={freeShapeAnnotations.updateGeoPosition}
          onEndGeoPositionChange={freeShapeAnnotations.updateEndGeoPosition}
          onCaptureAnnotationBefore={freeShapeUndoHandlers.captureAnnotationBefore}
          onFinalizeWithUndo={freeShapeUndoHandlers.finalizeWithUndo}
          groups={groups.groups}
          onUpdateGroupId={(id, groupId) => freeShapeAnnotations.updateAnnotation(id, { groupId })}
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
          inheritedProps={editingNodeInheritedProps}
        />
        <NetworkEditorPanel
          isVisible={!!state.editingNetwork}
          nodeData={editingNetworkData}
          onClose={networkEditorHandlers.handleClose}
          onSave={networkEditorHandlers.handleSave}
          onApply={networkEditorHandlers.handleApply}
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
          onAddNetwork={handleAddNetworkFromPanel}
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
          onSave={handleSaveTextAnnotationWithUndo}
          onClose={freeTextAnnotations.closeEditor}
          onDelete={freeTextUndoHandlers.deleteAnnotationWithUndo}
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
        {/* Easter egg: Logo click - Nightcall, Stickerbrush, Aquatic, Vaporwave, or DeusEx */}
        <EasterEggRenderer easterEgg={easterEgg} cyInstance={cyInstance} />
      </main>
    </div>
  );
};
