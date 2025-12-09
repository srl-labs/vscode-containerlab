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
 * TopoViewer State Interface
 */
export interface TopoViewerState {
  elements: CyElement[];
  labName: string;
  mode: 'edit' | 'view';
  deploymentState: DeploymentState;
  selectedNode: string | null;
  selectedEdge: string | null;
  isLocked: boolean;
  isLoading: boolean;
  linkLabelMode: LinkLabelMode;
  showDummyLinks: boolean;
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
  isLocked: true,
  isLoading: false,
  linkLabelMode: 'show-all',
  showDummyLinks: true
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
  | { type: 'TOGGLE_LOCK' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LINK_LABEL_MODE'; payload: LinkLabelMode }
  | { type: 'TOGGLE_DUMMY_LINKS' }
  | { type: 'SET_INITIAL_DATA'; payload: Partial<TopoViewerState> };

/**
 * Reducer function
 */
function topoViewerReducer(state: TopoViewerState, action: TopoViewerAction): TopoViewerState {
  switch (action.type) {
    case 'SET_ELEMENTS':
      return { ...state, elements: action.payload };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_DEPLOYMENT_STATE':
      return { ...state, deploymentState: action.payload };
    case 'SELECT_NODE':
      return { ...state, selectedNode: action.payload, selectedEdge: null };
    case 'SELECT_EDGE':
      return { ...state, selectedEdge: action.payload, selectedNode: null };
    case 'TOGGLE_LOCK':
      return { ...state, isLocked: !state.isLocked };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_LINK_LABEL_MODE':
      return { ...state, linkLabelMode: action.payload };
    case 'TOGGLE_DUMMY_LINKS':
      return { ...state, showDummyLinks: !state.showDummyLinks };
    case 'SET_INITIAL_DATA':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

/**
 * Context value interface
 */
interface TopoViewerContextValue {
  state: TopoViewerState;
  dispatch: React.Dispatch<TopoViewerAction>;
  initLoading: boolean;
  error: string | null;
  /* eslint-disable no-unused-vars */
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  toggleLock: () => void;
  setMode: (mode: 'edit' | 'view') => void;
  setLoading: (loading: boolean) => void;
  setLinkLabelMode: (mode: LinkLabelMode) => void;
  toggleDummyLinks: () => void;
  /* eslint-enable no-unused-vars */
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
    deploymentState: (obj.deploymentState as DeploymentState) || 'unknown'
  };
}

/**
 * Handle incoming extension messages
 */
function handleExtensionMessage(
  message: { type?: string; data?: Record<string, unknown> },
  dispatch: React.Dispatch<TopoViewerAction>
): void {
  if (!message.type) return;

  if (message.type === 'topology-data' && message.data?.elements) {
    dispatch({ type: 'SET_ELEMENTS', payload: message.data.elements as CyElement[] });
  } else if (message.type === 'topo-mode-changed') {
    if (message.data?.mode) {
      dispatch({ type: 'SET_MODE', payload: message.data.mode === 'viewer' ? 'view' : 'edit' });
    }
    if (message.data?.deploymentState) {
      dispatch({ type: 'SET_DEPLOYMENT_STATE', payload: message.data.deploymentState as DeploymentState });
    }
  }
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

  return { selectNode, selectEdge, toggleLock, setMode, setLoading, setLinkLabelMode, toggleDummyLinks };
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
