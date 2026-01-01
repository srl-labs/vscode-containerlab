/**
 * TopoViewer Context - Global state management for React TopoViewer
 */
import type { ReactNode } from 'react';
import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef } from 'react';

import type { CustomNodeTemplate, CustomTemplateEditorData } from '../../shared/types/editors';
import type { EdgeAnnotation } from '../../shared/types/topology';
import type { CyElement } from '../../shared/types/messages';
import type { CustomIconInfo } from '../../shared/types/icons';
import { extractUsedCustomIcons } from '../../shared/types/icons';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../utils/webviewMessageBus';
import { postCommand } from '../utils/extensionMessaging';
import { getElementId, getEdgeSource, getEdgeTarget } from '../utils/cytoscapeHelpers';
import { upsertEdgeAnnotation } from '../utils/edgeAnnotations';
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  clampEndpointLabelOffset,
  parseEndpointLabelOffset
} from '../utils/endpointLabelOffset';
import { isServicesInitialized, getTopologyIO, saveViewerSettings } from '../services';

// CustomNodeTemplate and CustomTemplateEditorData are available from shared/types/editors directly

/**
 * Deployment state type alias
 */
export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

/**
 * Link label display mode
 */
export type LinkLabelMode = 'show-all' | 'on-select' | 'hide';

/**
 * Processing mode for lifecycle operations
 */
export type ProcessingMode = 'deploy' | 'destroy' | null;

/**
 * TopoViewer State Interface
 */
export interface TopoViewerState {
  elements: CyElement[];
  labName: string;
  mode: 'edit' | 'view';
  deploymentState: DeploymentState;
  selectedNode: string | null;
  selectedEdge: string | null;
  editingNode: string | null;
  editingEdge: string | null;
  editingNetwork: string | null;
  isLocked: boolean;
  linkLabelMode: LinkLabelMode;
  showDummyLinks: boolean;
  endpointLabelOffsetEnabled: boolean;
  endpointLabelOffset: number;
  edgeAnnotations: EdgeAnnotation[];
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  /** Custom icons loaded from workspace and global directories */
  customIcons: CustomIconInfo[];
  /** Custom template being edited (not a graph node) */
  editingCustomTemplate: CustomTemplateEditorData | null;
  /** Whether a lifecycle operation is in progress */
  isProcessing: boolean;
  /** Current processing mode for visual feedback */
  processingMode: ProcessingMode;
  /** Counter to trigger editor data refresh after Apply */
  editorDataVersion: number;
}

/**
 * Initial state
 */
const initialState: TopoViewerState = {
  elements: [],
  labName: '',
  mode: 'edit',
  deploymentState: 'unknown',
  selectedNode: null,
  selectedEdge: null,
  editingNode: null,
  editingEdge: null,
  editingNetwork: null,
  isLocked: true,
  linkLabelMode: 'show-all',
  showDummyLinks: true,
  endpointLabelOffsetEnabled: false,
  endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
  edgeAnnotations: [],
  customNodes: [],
  defaultNode: '',
  customIcons: [],
  editingCustomTemplate: null,
  isProcessing: false,
  processingMode: null,
  editorDataVersion: 0
};

/**
 * Action types
 */
/**
 * Edge stats update payload for incremental updates
 */
interface EdgeStatsUpdate {
  id: string;
  extraData: Record<string, unknown>;
  classes?: string;
}

/** Payload for updating node data after save */
interface UpdateNodeDataPayload {
  nodeId: string;
  extraData: Record<string, unknown>;
}

interface UpdateNodePositionsPayload {
  positions: Array<{ id: string; position: { x: number; y: number } }>;
}

type TopoViewerAction =
  | { type: 'SET_ELEMENTS'; payload: CyElement[] }
  | { type: 'SET_MODE'; payload: 'edit' | 'view' }
  | { type: 'SET_DEPLOYMENT_STATE'; payload: DeploymentState }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'SELECT_EDGE'; payload: string | null }
  | { type: 'EDIT_NODE'; payload: string | null }
  | { type: 'EDIT_EDGE'; payload: string | null }
  | { type: 'EDIT_NETWORK'; payload: string | null }
  | { type: 'TOGGLE_LOCK' }
  | { type: 'SET_LINK_LABEL_MODE'; payload: LinkLabelMode }
  | { type: 'TOGGLE_DUMMY_LINKS' }
  | { type: 'TOGGLE_ENDPOINT_LABEL_OFFSET' }
  | { type: 'SET_ENDPOINT_LABEL_OFFSET'; payload: number }
  | { type: 'SET_EDGE_ANNOTATIONS'; payload: EdgeAnnotation[] }
  | { type: 'UPSERT_EDGE_ANNOTATION'; payload: EdgeAnnotation }
  | { type: 'SET_INITIAL_DATA'; payload: Partial<TopoViewerState> }
  | { type: 'ADD_NODE'; payload: CyElement }
  | { type: 'ADD_EDGE'; payload: CyElement }
  | { type: 'REMOVE_NODE_AND_EDGES'; payload: string }
  | { type: 'REMOVE_EDGE'; payload: string }
  | { type: 'SET_CUSTOM_NODES'; payload: { customNodes: CustomNodeTemplate[]; defaultNode: string } }
  | { type: 'SET_CUSTOM_ICONS'; payload: CustomIconInfo[] }
  | { type: 'EDIT_CUSTOM_TEMPLATE'; payload: CustomTemplateEditorData | null }
  | { type: 'SET_PROCESSING'; payload: { isProcessing: boolean; mode: ProcessingMode } }
  | { type: 'UPDATE_EDGE_STATS'; payload: EdgeStatsUpdate[] }
  | { type: 'RENAME_NODE'; payload: { oldId: string; newId: string } }
  | { type: 'UPDATE_NODE_DATA'; payload: UpdateNodeDataPayload }
  | { type: 'UPDATE_NODE_POSITIONS'; payload: UpdateNodePositionsPayload }
  | { type: 'REFRESH_EDITOR_DATA' };

/**
 * Reducer function
 */
type ReducerHandlers = {
  [K in TopoViewerAction['type']]?: (
    state: TopoViewerState,
    action: Extract<TopoViewerAction, { type: K }>
  ) => TopoViewerState;
};

const reducerHandlers: ReducerHandlers = {
  SET_ELEMENTS: (state, action) => ({ ...state, elements: action.payload }),
  SET_MODE: (state, action) => ({ ...state, mode: action.payload }),
  SET_DEPLOYMENT_STATE: (state, action) => ({ ...state, deploymentState: action.payload }),
  SELECT_NODE: (state, action) => ({ ...state, selectedNode: action.payload, selectedEdge: null }),
  SELECT_EDGE: (state, action) => ({ ...state, selectedEdge: action.payload, selectedNode: null }),
  EDIT_NODE: (state, action) => ({ ...state, editingNode: action.payload, editingEdge: null, editingNetwork: null, selectedNode: null, selectedEdge: null }),
  EDIT_EDGE: (state, action) => ({ ...state, editingEdge: action.payload, editingNode: null, editingNetwork: null, selectedNode: null, selectedEdge: null }),
  EDIT_NETWORK: (state, action) => ({ ...state, editingNetwork: action.payload, editingNode: null, editingEdge: null, selectedNode: null, selectedEdge: null }),
  TOGGLE_LOCK: (state) => ({ ...state, isLocked: !state.isLocked }),
  SET_LINK_LABEL_MODE: (state, action) => ({ ...state, linkLabelMode: action.payload }),
  TOGGLE_DUMMY_LINKS: (state) => ({ ...state, showDummyLinks: !state.showDummyLinks }),
  TOGGLE_ENDPOINT_LABEL_OFFSET: (state) => ({ ...state, endpointLabelOffsetEnabled: !state.endpointLabelOffsetEnabled }),
  SET_ENDPOINT_LABEL_OFFSET: (state, action) => ({ ...state, endpointLabelOffset: action.payload }),
  SET_EDGE_ANNOTATIONS: (state, action) => ({ ...state, edgeAnnotations: action.payload }),
  UPSERT_EDGE_ANNOTATION: (state, action) => ({
    ...state,
    edgeAnnotations: upsertEdgeAnnotation(state.edgeAnnotations, action.payload)
  }),
  SET_INITIAL_DATA: (state, action) => ({ ...state, ...action.payload }),
  ADD_NODE: (state, action) => ({
    ...state,
    elements: (() => {
      const nodeId = getElementId(action.payload);
      if (!nodeId) return state.elements;
      const exists = state.elements.some(el => el.group === 'nodes' && getElementId(el) === nodeId);
      return exists ? state.elements : [...state.elements, action.payload];
    })()
  }),
  ADD_EDGE: (state, action) => {
    const edge = action.payload;
    if (edge.group !== 'edges') return state;
    const edgeId = getElementId(edge);
    const exists = state.elements.some(el => el.group === 'edges' && getElementId(el) === edgeId);
    if (exists) return state;
    return {
      ...state,
      elements: [...state.elements, edge]
    };
  },
  REMOVE_NODE_AND_EDGES: (state, action) => {
    const nodeId = action.payload;
    const filteredElements = state.elements.filter(el => {
      if (el.group === 'nodes') {
        return getElementId(el) !== nodeId;
      }
      if (el.group === 'edges') {
        const source = getEdgeSource(el);
        const target = getEdgeTarget(el);
        return source !== nodeId && target !== nodeId;
      }
      return true;
    });
    const selectedEdgeStillExists = state.selectedEdge !== null
      ? filteredElements.some(el => {
          const elId = getElementId(el);
          return el.group === 'edges' && elId !== undefined && elId === state.selectedEdge;
        })
      : false;
    return {
      ...state,
      elements: filteredElements,
      selectedNode: state.selectedNode === nodeId ? null : state.selectedNode,
      selectedEdge: selectedEdgeStillExists ? state.selectedEdge : null
    };
  },
  REMOVE_EDGE: (state, action) => {
    const edgeId = action.payload;
    const filteredElements = state.elements.filter(el => !(el.group === 'edges' && getElementId(el) === edgeId));
    return {
      ...state,
      elements: filteredElements,
      selectedEdge: state.selectedEdge === edgeId ? null : state.selectedEdge
    };
  },
  SET_CUSTOM_NODES: (state, action) => ({
    ...state,
    customNodes: action.payload.customNodes,
    defaultNode: action.payload.defaultNode
  }),
  SET_CUSTOM_ICONS: (state, action) => ({
    ...state,
    customIcons: action.payload
  }),
  EDIT_CUSTOM_TEMPLATE: (state, action) => ({
    ...state,
    editingCustomTemplate: action.payload,
    // Clear other editing states when opening custom template editor
    editingNode: action.payload ? null : state.editingNode,
    editingEdge: action.payload ? null : state.editingEdge,
    editingNetwork: action.payload ? null : state.editingNetwork,
    selectedNode: action.payload ? null : state.selectedNode,
    selectedEdge: action.payload ? null : state.selectedEdge
  }),
  SET_PROCESSING: (state, action) => ({
    ...state,
    isProcessing: action.payload.isProcessing,
    processingMode: action.payload.mode
  }),
  UPDATE_EDGE_STATS: (state, action) => {
    const updates = action.payload;
    if (!updates || updates.length === 0) return state;

    // Create a map for O(1) lookup
    const updateMap = new Map(updates.map(u => [u.id, u]));

    // Update only the edges that have updates
    const newElements = state.elements.map(el => {
      if (el.group !== 'edges') return el;
      const edgeId = (el.data as Record<string, unknown>)?.id as string;
      const update = updateMap.get(edgeId);
      if (!update) return el;

      // Merge extraData
      const oldExtraData = ((el.data as Record<string, unknown>)?.extraData ?? {}) as Record<string, unknown>;
      const newExtraData = { ...oldExtraData, ...update.extraData };

      return {
        ...el,
        data: { ...el.data, extraData: newExtraData },
        classes: update.classes ?? el.classes
      };
    });

    return { ...state, elements: newElements };
  },
  RENAME_NODE: (state, action) => {
    const { oldId, newId } = action.payload;
    // Update node ID and name, and update edge references
    const elements = state.elements.map(el => {
      if (el.group === 'nodes' && (el.data as Record<string, unknown>)?.id === oldId) {
        return {
          ...el,
          data: { ...el.data, id: newId, name: newId }
        };
      }
      if (el.group === 'edges') {
        const data = el.data as Record<string, unknown>;
        const source = data.source as string;
        const target = data.target as string;
        if (source === oldId || target === oldId) {
          return {
            ...el,
            data: {
              ...data,
              source: source === oldId ? newId : source,
              target: target === oldId ? newId : target
            }
          };
        }
      }
      return el;
    });
    return { ...state, elements };
  },
  UPDATE_NODE_DATA: (state, action) => {
    const { nodeId, extraData } = action.payload;
    // Update the node's extraData AND top-level visual properties
    // IMPORTANT: We REPLACE extraData entirely (not merge) so deleted fields stay deleted
    const elements = state.elements.map(el => {
      if (el.group === 'nodes' && (el.data as Record<string, unknown>)?.id === nodeId) {
        const currentData = el.data as Record<string, unknown>;

        // Build updated data with top-level visual properties
        // Replace extraData entirely - the caller provides the complete new state
        const updatedData: Record<string, unknown> = {
          ...currentData,
          extraData: extraData
        };

        // Also update top-level visual properties that Cytoscape uses for styling
        if (extraData.topoViewerRole !== undefined) {
          updatedData.topoViewerRole = extraData.topoViewerRole;
        }
        if (extraData.iconColor !== undefined) {
          updatedData.iconColor = extraData.iconColor;
        }
        if (extraData.iconCornerRadius !== undefined) {
          updatedData.iconCornerRadius = extraData.iconCornerRadius;
        }

        return { ...el, data: updatedData };
      }
      return el;
    });
    return { ...state, elements };
  }
  ,
  UPDATE_NODE_POSITIONS: (state, action) => {
    const updates = new Map(action.payload.positions.map(p => [p.id, p.position]));
    if (updates.size === 0) return state;

    const nextElements = state.elements.map(el => {
      if (el.group !== 'nodes') return el;
      const id = getElementId(el);
      if (!id) return el;
      const nextPos = updates.get(id);
      if (!nextPos) return el;
      return { ...el, position: { x: nextPos.x, y: nextPos.y } };
    });

    return { ...state, elements: nextElements };
  },
  REFRESH_EDITOR_DATA: (state) => ({ ...state, editorDataVersion: state.editorDataVersion + 1 })
};

function topoViewerReducer(state: TopoViewerState, action: TopoViewerAction): TopoViewerState {
  const handler = reducerHandlers[action.type];
  if (handler) {
    return handler(state, action as never);
  }
  return state;
}

/**
 * Context value interface
 */
interface TopoViewerStateContextValue {
  state: TopoViewerState;
  dispatch: React.Dispatch<TopoViewerAction>;
}

interface TopoViewerActionsContextValue {
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  editNode: (nodeId: string | null) => void;
  editEdge: (edgeId: string | null) => void;
  editNetwork: (nodeId: string | null) => void;
  toggleLock: () => void;
  setMode: (mode: 'edit' | 'view') => void;
  setLinkLabelMode: (mode: LinkLabelMode) => void;
  toggleDummyLinks: () => void;
  toggleEndpointLabelOffset: () => void;
  setEndpointLabelOffset: (value: number) => void;
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
  upsertEdgeAnnotation: (annotation: EdgeAnnotation) => void;
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodePositions: (positions: Array<{ id: string; position: { x: number; y: number } }>) => void;
  setCustomNodes: (customNodes: CustomNodeTemplate[], defaultNode: string) => void;
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void;
  setProcessing: (isProcessing: boolean, mode?: 'deploy' | 'destroy') => void;
  refreshEditorData: () => void;
}

/**
 * Create context
 */
const TopoViewerStateContext = createContext<TopoViewerStateContextValue | undefined>(undefined);
const TopoViewerActionsContext = createContext<TopoViewerActionsContextValue | undefined>(undefined);

/**
 * Provider props
 */
interface TopoViewerProviderProps {
  children: ReactNode;
  initialData?: unknown;
}

/**
 * Parse initial data from extension
 */
function parseInitialData(data: unknown): Partial<TopoViewerState> {
  if (!data || typeof data !== 'object') {
    return {};
  }
  const obj = data as Record<string, unknown>;
  const result: Partial<TopoViewerState> = {
    elements: (obj.elements as CyElement[]) || [],
    labName: (obj.labName as string) || '',
    mode: (obj.mode as 'edit' | 'view') || 'edit',
    deploymentState: (obj.deploymentState as DeploymentState) || 'unknown',
    customNodes: (obj.customNodes as CustomNodeTemplate[]) || [],
    defaultNode: (obj.defaultNode as string) || '',
    customIcons: (obj.customIcons as CustomIconInfo[]) || []
  };
  // Only set isLocked if explicitly provided (allows dev mode to override default)
  if (typeof obj.isLocked === 'boolean') {
    result.isLocked = obj.isLocked;
  }
  const viewerSettings = obj.viewerSettings as Record<string, unknown> | undefined;
  Object.assign(result, extractEndpointLabelSettings(viewerSettings));
  if (Array.isArray(obj.edgeAnnotations)) {
    result.edgeAnnotations = obj.edgeAnnotations as EdgeAnnotation[];
  }
  return result;
}

function extractEndpointLabelSettings(
  viewerSettings: Record<string, unknown> | undefined
): Partial<TopoViewerState> {
  if (!viewerSettings) return {};
  const result: Partial<TopoViewerState> = {};
  if (typeof viewerSettings.endpointLabelOffsetEnabled === 'boolean') {
    result.endpointLabelOffsetEnabled = viewerSettings.endpointLabelOffsetEnabled;
  }
  const offset = parseEndpointLabelOffset(viewerSettings.endpointLabelOffset);
  if (offset !== null) {
    result.endpointLabelOffset = offset;
  }
  return result;
}

/**
 * Handle incoming extension messages
 */
type ExtensionMessage = { type?: string; data?: Record<string, unknown>; action?: string; nodeId?: string; edgeId?: string };

function handlePanelAction(message: ExtensionMessage, dispatch: React.Dispatch<TopoViewerAction>): void {
  const action = message.action;
  const nodeId = message.nodeId as string | undefined;
  const edgeId = message.edgeId as string | undefined;
  if (!action) return;

  if (action === 'delete-node' && nodeId) {
    dispatch({ type: 'REMOVE_NODE_AND_EDGES', payload: nodeId });
    return;
  }
  if (action === 'delete-link' && edgeId) {
    dispatch({ type: 'REMOVE_EDGE', payload: edgeId });
    return;
  }

  // Edit actions trigger the editor panel
  if (action === 'edit-node' && nodeId) {
    dispatch({ type: 'EDIT_NODE', payload: nodeId });
    return;
  }
  if (action === 'edit-link' && edgeId) {
    dispatch({ type: 'EDIT_EDGE', payload: edgeId });
    return;
  }

  const nodeSelectActions = new Set(['node-info']);
  const edgeSelectActions = new Set(['link-info']);

  if (nodeSelectActions.has(action) && nodeId) {
    dispatch({ type: 'SELECT_NODE', payload: nodeId });
    return;
  }
  if (edgeSelectActions.has(action) && edgeId) {
    dispatch({ type: 'SELECT_EDGE', payload: edgeId });
  }
}

function handleExtensionMessage(
  message: ExtensionMessage,
  dispatch: React.Dispatch<TopoViewerAction>
): void {
  if (!message.type) return;

  const handlers: Record<string, () => void> = {
    'topology-data': () => {
      // Elements can be at top level (message.elements) or in data (message.data.elements)
      const msg = message as unknown as {
        elements?: CyElement[];
        data?: {
          elements?: CyElement[];
          viewerSettings?: Record<string, unknown>;
          edgeAnnotations?: EdgeAnnotation[];
        };
      };
      const elements = msg.elements || msg.data?.elements;
      if (elements) {
        dispatch({ type: 'SET_ELEMENTS', payload: elements });

        // Re-initialize TopologyIO to sync with the new YAML file content
        // This is critical for node deletion to work after external file changes
        const yamlFilePath = (window as { __INITIAL_DATA__?: { yamlFilePath?: string } }).__INITIAL_DATA__?.yamlFilePath;
        if (yamlFilePath && isServicesInitialized()) {
          const topologyIO = getTopologyIO();
          void topologyIO.initializeFromFile(yamlFilePath).then((result) => {
            if (!result.success) {
              console.error(`[TopoViewerContext] Failed to reinitialize TopologyIO: ${result.error}`);
            }
          });
        }
      }

      const viewerSettings = extractEndpointLabelSettings(msg.data?.viewerSettings);
      if (Object.keys(viewerSettings).length > 0) {
        dispatch({ type: 'SET_INITIAL_DATA', payload: viewerSettings });
      }
      if (msg.data?.edgeAnnotations) {
        dispatch({ type: 'SET_EDGE_ANNOTATIONS', payload: msg.data.edgeAnnotations });
      }
    },
    'node-renamed': () => {
      const data = message.data as { oldId?: string; newId?: string } | undefined;
      if (data?.oldId && data?.newId) {
        dispatch({ type: 'RENAME_NODE', payload: { oldId: data.oldId, newId: data.newId } });
      }
    },
    'node-data-updated': () => {
      const data = message.data as { nodeId?: string; extraData?: Record<string, unknown> } | undefined;
      if (data?.nodeId && data?.extraData) {
        dispatch({ type: 'UPDATE_NODE_DATA', payload: { nodeId: data.nodeId, extraData: data.extraData } });
      }
    },
    'edge-stats-update': () => {
      const edgeUpdates = message.data?.edgeUpdates as EdgeStatsUpdate[] | undefined;
      if (edgeUpdates && edgeUpdates.length > 0) {
        dispatch({ type: 'UPDATE_EDGE_STATS', payload: edgeUpdates });
      }
    },
    'topo-mode-changed': () => {
      if (message.data?.mode) {
        // Support both old format ('viewer'/'editor') and new format ('view'/'edit')
        const modeValue = message.data.mode;
        const normalizedMode = (modeValue === 'viewer' || modeValue === 'view') ? 'view' : 'edit';
        dispatch({ type: 'SET_MODE', payload: normalizedMode });
      }
      if (message.data?.deploymentState) {
        dispatch({ type: 'SET_DEPLOYMENT_STATE', payload: message.data.deploymentState as DeploymentState });
      }
    },
    'panel-action': () => handlePanelAction(message, dispatch),
    'custom-nodes-updated': () => {
      const customNodes = (message as unknown as { customNodes?: CustomNodeTemplate[] }).customNodes;
      const defaultNode = (message as unknown as { defaultNode?: string }).defaultNode;
      if (customNodes !== undefined) {
        dispatch({
          type: 'SET_CUSTOM_NODES',
          payload: { customNodes, defaultNode: defaultNode || '' }
        });
      }
    },
    'icon-list-response': () => {
      const icons = (message as unknown as { icons?: CustomIconInfo[] }).icons;
      if (icons !== undefined) {
        dispatch({ type: 'SET_CUSTOM_ICONS', payload: icons });
      }
    },
    'lab-lifecycle-status': () => {
      // Lifecycle operation completed - clear processing state
      dispatch({ type: 'SET_PROCESSING', payload: { isProcessing: false, mode: null } });
    }
  };

  handlers[message.type]?.();
}

/**
 * Custom hook for selection-related action creators
 */
function useSelectionActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const selectNode = useCallback((nodeId: string | null) => {
    dispatch({ type: 'SELECT_NODE', payload: nodeId });
  }, [dispatch]);
  const selectEdge = useCallback((edgeId: string | null) => {
    dispatch({ type: 'SELECT_EDGE', payload: edgeId });
  }, [dispatch]);
  const editNode = useCallback((nodeId: string | null) => {
    dispatch({ type: 'EDIT_NODE', payload: nodeId });
  }, [dispatch]);
  const editEdge = useCallback((edgeId: string | null) => {
    dispatch({ type: 'EDIT_EDGE', payload: edgeId });
  }, [dispatch]);
  const editNetwork = useCallback((nodeId: string | null) => {
    dispatch({ type: 'EDIT_NETWORK', payload: nodeId });
  }, [dispatch]);

  return useMemo(() => ({
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork
  }), [selectNode, selectEdge, editNode, editEdge, editNetwork]);
}

/**
 * Custom hook for graph element action creators
 */
function useGraphElementActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const addNode = useCallback((node: CyElement) => {
    dispatch({ type: 'ADD_NODE', payload: node });
  }, [dispatch]);
  const addEdge = useCallback((edge: CyElement) => {
    dispatch({ type: 'ADD_EDGE', payload: edge });
  }, [dispatch]);
  const removeNodeAndEdges = useCallback((nodeId: string) => {
    dispatch({ type: 'REMOVE_NODE_AND_EDGES', payload: nodeId });
  }, [dispatch]);
  const removeEdge = useCallback((edgeId: string) => {
    dispatch({ type: 'REMOVE_EDGE', payload: edgeId });
  }, [dispatch]);
  const updateNodePositions = useCallback((positions: Array<{ id: string; position: { x: number; y: number } }>) => {
    dispatch({ type: 'UPDATE_NODE_POSITIONS', payload: { positions } });
  }, [dispatch]);

  return useMemo(() => ({
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodePositions
  }), [addNode, addEdge, removeNodeAndEdges, removeEdge, updateNodePositions]);
}

/**
 * Custom hook for UI state action creators
 */
function useUIStateActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const toggleLock = useCallback(() => {
    dispatch({ type: 'TOGGLE_LOCK' });
  }, [dispatch]);
  const setMode = useCallback((mode: 'edit' | 'view') => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, [dispatch]);
  const setLinkLabelMode = useCallback((mode: LinkLabelMode) => {
    dispatch({ type: 'SET_LINK_LABEL_MODE', payload: mode });
  }, [dispatch]);
  const toggleDummyLinks = useCallback(() => {
    dispatch({ type: 'TOGGLE_DUMMY_LINKS' });
  }, [dispatch]);
  const toggleEndpointLabelOffset = useCallback(() => {
    dispatch({ type: 'TOGGLE_ENDPOINT_LABEL_OFFSET' });
  }, [dispatch]);
  const setEndpointLabelOffset = useCallback((value: number) => {
    const next = Number.isFinite(value) ? clampEndpointLabelOffset(value) : DEFAULT_ENDPOINT_LABEL_OFFSET;
    dispatch({ type: 'SET_ENDPOINT_LABEL_OFFSET', payload: next });
  }, [dispatch]);
  const setEdgeAnnotations = useCallback((annotations: EdgeAnnotation[]) => {
    dispatch({ type: 'SET_EDGE_ANNOTATIONS', payload: annotations });
  }, [dispatch]);
  const upsertEdgeAnnotationAction = useCallback((annotation: EdgeAnnotation) => {
    dispatch({ type: 'UPSERT_EDGE_ANNOTATION', payload: annotation });
  }, [dispatch]);
  const setCustomNodes = useCallback((customNodes: CustomNodeTemplate[], defaultNode: string) => {
    dispatch({ type: 'SET_CUSTOM_NODES', payload: { customNodes, defaultNode } });
  }, [dispatch]);
  const editCustomTemplate = useCallback((data: CustomTemplateEditorData | null) => {
    dispatch({ type: 'EDIT_CUSTOM_TEMPLATE', payload: data });
  }, [dispatch]);
  const setProcessing = useCallback((isProcessing: boolean, mode?: 'deploy' | 'destroy') => {
    dispatch({ type: 'SET_PROCESSING', payload: { isProcessing, mode: mode ?? null } });
  }, [dispatch]);

  const refreshEditorData = useCallback(() => {
    dispatch({ type: 'REFRESH_EDITOR_DATA' });
  }, [dispatch]);

  return useMemo(() => ({
    toggleLock,
    setMode,
    setLinkLabelMode,
    toggleDummyLinks,
    toggleEndpointLabelOffset,
    setEndpointLabelOffset,
    setEdgeAnnotations,
    upsertEdgeAnnotation: upsertEdgeAnnotationAction,
    setCustomNodes,
    editCustomTemplate,
    setProcessing,
    refreshEditorData
  }), [
    toggleLock,
    setMode,
    setLinkLabelMode,
    toggleDummyLinks,
    toggleEndpointLabelOffset,
    setEndpointLabelOffset,
    setEdgeAnnotations,
    upsertEdgeAnnotationAction,
    setCustomNodes,
    editCustomTemplate,
    setProcessing,
    refreshEditorData
  ]);
}

/**
 * Custom hook for action creators - combines all action hooks
 */
function useActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const selectionActions = useSelectionActions(dispatch);
  const graphElementActions = useGraphElementActions(dispatch);
  const uiStateActions = useUIStateActions(dispatch);

  return useMemo(() => ({
    ...selectionActions,
    ...graphElementActions,
    ...uiStateActions
  }), [selectionActions, graphElementActions, uiStateActions]);
}

/**
 * TopoViewer Context Provider
 */
export const TopoViewerProvider: React.FC<TopoViewerProviderProps> = ({ children, initialData }) => {
  // Initialize reducer with parsed initial data to avoid race conditions
  // where state.defaultNode would be empty on first render
  const [state, dispatch] = useReducer(
    topoViewerReducer,
    initialData,
    (initial) => {
      try {
        const parsed = parseInitialData(initial);
        return { ...initialState, ...parsed };
      } catch {
        return initialState;
      }
    }
  );
  const actions = useActions(dispatch);
  const endpointOffsetPersistRef = useRef<{ enabled: boolean; offset: number } | null>(null);
  const skipEndpointOffsetPersistRef = useRef(true);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (message && typeof message === 'object' && message.type) {
        handleExtensionMessage(message, dispatch);
      }
    };
    return subscribeToWebviewMessages(handleMessage);
  }, [dispatch]);

  useEffect(() => {
    const current = {
      enabled: state.endpointLabelOffsetEnabled,
      offset: state.endpointLabelOffset
    };
    if (skipEndpointOffsetPersistRef.current) {
      skipEndpointOffsetPersistRef.current = false;
      endpointOffsetPersistRef.current = current;
      return;
    }
    const previous = endpointOffsetPersistRef.current;
    if (previous && previous.enabled === current.enabled && previous.offset === current.offset) {
      return;
    }
    endpointOffsetPersistRef.current = current;
    void saveViewerSettings({
      endpointLabelOffsetEnabled: current.enabled,
      endpointLabelOffset: current.offset
    });
  }, [state.endpointLabelOffsetEnabled, state.endpointLabelOffset]);

  // Track used custom icons and trigger reconciliation when usage changes
  const prevUsedIconsRef = useRef<string[]>([]);
  useEffect(() => {
    // Extract custom icons currently used by nodes
    const usedIcons = extractUsedCustomIcons(state.elements);
    const prevUsedIcons = prevUsedIconsRef.current;

    // Check if the set of used icons has changed
    const usedSet = new Set(usedIcons);
    const prevSet = new Set(prevUsedIcons);
    const hasChanged = usedIcons.length !== prevUsedIcons.length ||
      usedIcons.some(icon => !prevSet.has(icon)) ||
      prevUsedIcons.some(icon => !usedSet.has(icon));

    if (hasChanged && state.elements.length > 0) {
      prevUsedIconsRef.current = usedIcons;
      // Trigger icon reconciliation on extension side
      postCommand('icon-reconcile', { usedIcons });
    }
  }, [state.elements]);

  const stateValue = useMemo<TopoViewerStateContextValue>(() => ({
    state,
    dispatch
  }), [state, dispatch]);

  return (
    <TopoViewerStateContext.Provider value={stateValue}>
      <TopoViewerActionsContext.Provider value={actions}>
        {children}
      </TopoViewerActionsContext.Provider>
    </TopoViewerStateContext.Provider>
  );
};

/**
 * Hook to use TopoViewer state + dispatch
 */
export const useTopoViewerState = (): TopoViewerStateContextValue => {
  const context = useContext(TopoViewerStateContext);
  if (context === undefined) {
    throw new Error('useTopoViewerState must be used within a TopoViewerProvider');
  }
  return context;
};

/**
 * Hook to use TopoViewer actions (stable)
 */
export const useTopoViewerActions = (): TopoViewerActionsContextValue => {
  const context = useContext(TopoViewerActionsContext);
  if (context === undefined) {
    throw new Error('useTopoViewerActions must be used within a TopoViewerProvider');
  }
  return context;
};

/**
 * Legacy combined hook (prefer useTopoViewerState/useTopoViewerActions)
 */
export const useTopoViewer = (): TopoViewerStateContextValue & TopoViewerActionsContextValue => {
  const stateContext = useTopoViewerState();
  const actionsContext = useTopoViewerActions();
  return useMemo(() => ({ ...stateContext, ...actionsContext }), [stateContext, actionsContext]);
};
