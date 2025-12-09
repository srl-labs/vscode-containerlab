/**
 * TopoViewer Context - Global state management for React TopoViewer
 */
import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { CyElement } from '../../shared/types/messages';

/**
 * Deployment state type alias
 */
export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

/**
 * Link label display mode
 */
export type LinkLabelMode = 'show-all' | 'on-select' | 'hide';

/**
 * Custom node template from configuration
 */
export interface CustomNodeTemplate {
  name: string;
  kind: string;
  type?: string;
  image?: string;
  icon?: string;
  baseName?: string;
  interfacePattern?: string;
  setDefault?: boolean;
}

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
  isLocked: boolean;
  isLoading: boolean;
  linkLabelMode: LinkLabelMode;
  showDummyLinks: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
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
  isLocked: true,
  isLoading: false,
  linkLabelMode: 'show-all',
  showDummyLinks: true,
  customNodes: [],
  defaultNode: ''
};

/**
 * Action types
 */
type TopoViewerAction =
  | { type: 'SET_ELEMENTS'; payload: CyElement[] }
  | { type: 'SET_MODE'; payload: 'edit' | 'view' }
  | { type: 'SET_DEPLOYMENT_STATE'; payload: DeploymentState }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'SELECT_EDGE'; payload: string | null }
  | { type: 'EDIT_NODE'; payload: string | null }
  | { type: 'EDIT_EDGE'; payload: string | null }
  | { type: 'TOGGLE_LOCK' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LINK_LABEL_MODE'; payload: LinkLabelMode }
  | { type: 'TOGGLE_DUMMY_LINKS' }
  | { type: 'SET_INITIAL_DATA'; payload: Partial<TopoViewerState> }
  | { type: 'REMOVE_NODE_AND_EDGES'; payload: string }
  | { type: 'REMOVE_EDGE'; payload: string };

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
  EDIT_NODE: (state, action) => ({ ...state, editingNode: action.payload, editingEdge: null, selectedNode: null, selectedEdge: null }),
  EDIT_EDGE: (state, action) => ({ ...state, editingEdge: action.payload, editingNode: null, selectedNode: null, selectedEdge: null }),
  TOGGLE_LOCK: (state) => ({ ...state, isLocked: !state.isLocked }),
  SET_LOADING: (state, action) => ({ ...state, isLoading: action.payload }),
  SET_LINK_LABEL_MODE: (state, action) => ({ ...state, linkLabelMode: action.payload }),
  TOGGLE_DUMMY_LINKS: (state) => ({ ...state, showDummyLinks: !state.showDummyLinks }),
  SET_INITIAL_DATA: (state, action) => ({ ...state, ...action.payload }),
  REMOVE_NODE_AND_EDGES: (state, action) => {
    const nodeId = action.payload;
    const filteredElements = state.elements.filter(el => {
      const data = el.data || {};
      if (el.group === 'nodes') {
        return (data as any).id !== nodeId;
      }
      if (el.group === 'edges') {
        const source = (data as any).source;
        const target = (data as any).target;
        return source !== nodeId && target !== nodeId;
      }
      return true;
    });
    const selectedEdgeStillExists = state.selectedEdge
      ? filteredElements.some(el => el.group === 'edges' && (el.data as any)?.id === state.selectedEdge)
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
    const filteredElements = state.elements.filter(el => !(el.group === 'edges' && (el.data as any)?.id === edgeId));
    return {
      ...state,
      elements: filteredElements,
      selectedEdge: state.selectedEdge === edgeId ? null : state.selectedEdge
    };
  }
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
interface TopoViewerContextValue {
  state: TopoViewerState;
  dispatch: React.Dispatch<TopoViewerAction>;
  initLoading: boolean;
  error: string | null;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  editNode: (nodeId: string | null) => void;
  editEdge: (edgeId: string | null) => void;
  toggleLock: () => void;
  setMode: (mode: 'edit' | 'view') => void;
  setLoading: (loading: boolean) => void;
  setLinkLabelMode: (mode: LinkLabelMode) => void;
  toggleDummyLinks: () => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
}

/**
 * Create context
 */
const TopoViewerContext = createContext<TopoViewerContextValue | undefined>(undefined);

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
  return {
    elements: (obj.elements as CyElement[]) || [],
    labName: (obj.labName as string) || '',
    mode: (obj.mode as 'edit' | 'view') || 'edit',
    deploymentState: (obj.deploymentState as DeploymentState) || 'unknown',
    customNodes: (obj.customNodes as CustomNodeTemplate[]) || [],
    defaultNode: (obj.defaultNode as string) || ''
  };
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

  const nodeSelectActions = new Set(['node-info', 'start-link']);
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
      if (message.data?.elements) {
        dispatch({ type: 'SET_ELEMENTS', payload: message.data.elements as CyElement[] });
      }
    },
    'topo-mode-changed': () => {
      if (message.data?.mode) {
        dispatch({ type: 'SET_MODE', payload: message.data.mode === 'viewer' ? 'view' : 'edit' });
      }
      if (message.data?.deploymentState) {
        dispatch({ type: 'SET_DEPLOYMENT_STATE', payload: message.data.deploymentState as DeploymentState });
      }
    },
    'panel-action': () => handlePanelAction(message, dispatch)
  };

  handlers[message.type]?.();
}

/**
 * Custom hook for action creators
 */
function useActions(dispatch: React.Dispatch<TopoViewerAction>) {
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

  const toggleLock = useCallback(() => {
    dispatch({ type: 'TOGGLE_LOCK' });
  }, [dispatch]);

  const setMode = useCallback((mode: 'edit' | 'view') => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, [dispatch]);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, [dispatch]);

  const setLinkLabelMode = useCallback((mode: LinkLabelMode) => {
    dispatch({ type: 'SET_LINK_LABEL_MODE', payload: mode });
  }, [dispatch]);

  const toggleDummyLinks = useCallback(() => {
    dispatch({ type: 'TOGGLE_DUMMY_LINKS' });
  }, [dispatch]);

  const removeNodeAndEdges = useCallback((nodeId: string) => {
    dispatch({ type: 'REMOVE_NODE_AND_EDGES', payload: nodeId });
  }, [dispatch]);

  const removeEdge = useCallback((edgeId: string) => {
    dispatch({ type: 'REMOVE_EDGE', payload: edgeId });
  }, [dispatch]);

  return {
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    toggleLock,
    setMode,
    setLoading,
    setLinkLabelMode,
    toggleDummyLinks,
    removeNodeAndEdges,
    removeEdge
  };
}

/**
 * TopoViewer Context Provider
 */
export const TopoViewerProvider: React.FC<TopoViewerProviderProps> = ({ children, initialData }) => {
  const [state, dispatch] = useReducer(topoViewerReducer, initialState);
  const [initLoading, setInitLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const actions = useActions(dispatch);

  // Initialize with data from extension
  useEffect(() => {
    try {
      const parsed = parseInitialData(initialData);
      dispatch({ type: 'SET_INITIAL_DATA', payload: parsed });
      setInitLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setInitLoading(false);
    }
  }, [initialData]);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message && typeof message === 'object') {
        handleExtensionMessage(message, dispatch);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const value = useMemo<TopoViewerContextValue>(() => ({
    state,
    dispatch,
    initLoading,
    error,
    ...actions
  }), [state, initLoading, error, actions]);

  return (
    <TopoViewerContext.Provider value={value}>
      {children}
    </TopoViewerContext.Provider>
  );
};

/**
 * Hook to use TopoViewer context
 */
export const useTopoViewer = (): TopoViewerContextValue => {
  const context = useContext(TopoViewerContext);
  if (context === undefined) {
    throw new Error('useTopoViewer must be used within a TopoViewerProvider');
  }
  return context;
};
