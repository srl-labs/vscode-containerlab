/**
 * TopoViewer Context - UI state management for React TopoViewer
 *
 * NOTE: Graph data (nodes/edges) has been moved to GraphContext.
 * This context now only handles UI state, selections, and editing state.
 */
import type { ReactNode } from "react";
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef
} from "react";

import type { CustomNodeTemplate, CustomTemplateEditorData } from "../../shared/types/editors";
import type { EdgeAnnotation } from "../../shared/types/topology";
import type { CustomIconInfo } from "../../shared/types/icons";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../utils/webviewMessageBus";
import { upsertEdgeAnnotation } from "../utils/edgeAnnotations";
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  clampEndpointLabelOffset,
  parseEndpointLabelOffset
} from "../utils/endpointLabelOffset";
import { saveEdgeAnnotations, saveViewerSettings } from "../services";

/**
 * Deployment state type alias
 */
export type DeploymentState = "deployed" | "undeployed" | "unknown";

/**
 * Link label display mode
 */
export type LinkLabelMode = "show-all" | "on-select" | "hide";

/**
 * Processing mode for lifecycle operations
 */
export type ProcessingMode = "deploy" | "destroy" | null;

/**
 * TopoViewer State Interface - UI state only (no graph data)
 */
export interface TopoViewerState {
  labName: string;
  mode: "edit" | "view";
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
  customIcons: CustomIconInfo[];
  editingCustomTemplate: CustomTemplateEditorData | null;
  isProcessing: boolean;
  processingMode: ProcessingMode;
  editorDataVersion: number;
  customNodeError: string | null;
}

/**
 * Initial state
 */
const initialState: TopoViewerState = {
  labName: "",
  mode: "edit",
  deploymentState: "unknown",
  selectedNode: null,
  selectedEdge: null,
  editingNode: null,
  editingEdge: null,
  editingNetwork: null,
  isLocked: true,
  linkLabelMode: "show-all",
  showDummyLinks: true,
  endpointLabelOffsetEnabled: true,
  endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
  edgeAnnotations: [],
  customNodes: [],
  defaultNode: "",
  customIcons: [],
  editingCustomTemplate: null,
  isProcessing: false,
  processingMode: null,
  editorDataVersion: 0,
  customNodeError: null
};

/**
 * Action types - UI actions only (no graph manipulation)
 */
type TopoViewerAction =
  | { type: "SET_MODE"; payload: "edit" | "view" }
  | { type: "SET_DEPLOYMENT_STATE"; payload: DeploymentState }
  | { type: "SELECT_NODE"; payload: string | null }
  | { type: "SELECT_EDGE"; payload: string | null }
  | { type: "EDIT_NODE"; payload: string | null }
  | { type: "EDIT_EDGE"; payload: string | null }
  | { type: "EDIT_NETWORK"; payload: string | null }
  | { type: "TOGGLE_LOCK" }
  | { type: "SET_LINK_LABEL_MODE"; payload: LinkLabelMode }
  | { type: "TOGGLE_DUMMY_LINKS" }
  | { type: "TOGGLE_ENDPOINT_LABEL_OFFSET" }
  | { type: "SET_ENDPOINT_LABEL_OFFSET"; payload: number }
  | { type: "SET_EDGE_ANNOTATIONS"; payload: EdgeAnnotation[] }
  | { type: "UPSERT_EDGE_ANNOTATION"; payload: EdgeAnnotation }
  | { type: "SET_INITIAL_DATA"; payload: Partial<TopoViewerState> }
  | {
      type: "SET_CUSTOM_NODES";
      payload: { customNodes: CustomNodeTemplate[]; defaultNode: string };
    }
  | { type: "SET_CUSTOM_ICONS"; payload: CustomIconInfo[] }
  | { type: "EDIT_CUSTOM_TEMPLATE"; payload: CustomTemplateEditorData | null }
  | { type: "SET_PROCESSING"; payload: { isProcessing: boolean; mode: ProcessingMode } }
  | { type: "REFRESH_EDITOR_DATA" }
  | { type: "SET_CUSTOM_NODE_ERROR"; payload: string | null }
  | { type: "CLEAR_SELECTION_FOR_DELETED_NODE"; payload: string }
  | { type: "CLEAR_SELECTION_FOR_DELETED_EDGE"; payload: string };

/**
 * Reducer handlers
 */
type ReducerHandlers = {
  [K in TopoViewerAction["type"]]?: (
    state: TopoViewerState,
    action: Extract<TopoViewerAction, { type: K }>
  ) => TopoViewerState;
};

const reducerHandlers: ReducerHandlers = {
  SET_MODE: (state, action) => ({ ...state, mode: action.payload }),
  SET_DEPLOYMENT_STATE: (state, action) => ({ ...state, deploymentState: action.payload }),
  SELECT_NODE: (state, action) => ({ ...state, selectedNode: action.payload, selectedEdge: null }),
  SELECT_EDGE: (state, action) => ({ ...state, selectedEdge: action.payload, selectedNode: null }),
  EDIT_NODE: (state, action) => ({
    ...state,
    editingNode: action.payload,
    editingEdge: null,
    editingNetwork: null,
    selectedNode: null,
    selectedEdge: null
  }),
  EDIT_EDGE: (state, action) => ({
    ...state,
    editingEdge: action.payload,
    editingNode: null,
    editingNetwork: null,
    selectedNode: null,
    selectedEdge: null
  }),
  EDIT_NETWORK: (state, action) => ({
    ...state,
    editingNetwork: action.payload,
    editingNode: null,
    editingEdge: null,
    selectedNode: null,
    selectedEdge: null
  }),
  TOGGLE_LOCK: (state) => ({ ...state, isLocked: !state.isLocked }),
  SET_LINK_LABEL_MODE: (state, action) => ({ ...state, linkLabelMode: action.payload }),
  TOGGLE_DUMMY_LINKS: (state) => ({ ...state, showDummyLinks: !state.showDummyLinks }),
  TOGGLE_ENDPOINT_LABEL_OFFSET: (state) => ({
    ...state,
    endpointLabelOffsetEnabled: !state.endpointLabelOffsetEnabled
  }),
  SET_ENDPOINT_LABEL_OFFSET: (state, action) => ({ ...state, endpointLabelOffset: action.payload }),
  SET_EDGE_ANNOTATIONS: (state, action) => ({ ...state, edgeAnnotations: action.payload }),
  UPSERT_EDGE_ANNOTATION: (state, action) => ({
    ...state,
    edgeAnnotations: upsertEdgeAnnotation(state.edgeAnnotations, action.payload)
  }),
  SET_INITIAL_DATA: (state, action) => ({ ...state, ...action.payload }),
  SET_CUSTOM_NODES: (state, action) => ({
    ...state,
    customNodes: action.payload.customNodes,
    defaultNode: action.payload.defaultNode,
    customNodeError: null
  }),
  SET_CUSTOM_NODE_ERROR: (state, action) => ({
    ...state,
    customNodeError: action.payload
  }),
  SET_CUSTOM_ICONS: (state, action) => ({
    ...state,
    customIcons: action.payload
  }),
  EDIT_CUSTOM_TEMPLATE: (state, action) => ({
    ...state,
    editingCustomTemplate: action.payload,
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
  REFRESH_EDITOR_DATA: (state) => ({ ...state, editorDataVersion: state.editorDataVersion + 1 }),
  CLEAR_SELECTION_FOR_DELETED_NODE: (state, action) => ({
    ...state,
    selectedNode: state.selectedNode === action.payload ? null : state.selectedNode,
    editingNode: state.editingNode === action.payload ? null : state.editingNode,
    editingNetwork: state.editingNetwork === action.payload ? null : state.editingNetwork
  }),
  CLEAR_SELECTION_FOR_DELETED_EDGE: (state, action) => ({
    ...state,
    selectedEdge: state.selectedEdge === action.payload ? null : state.selectedEdge,
    editingEdge: state.editingEdge === action.payload ? null : state.editingEdge
  })
};

function topoViewerReducer(state: TopoViewerState, action: TopoViewerAction): TopoViewerState {
  const handler = reducerHandlers[action.type];
  if (handler) {
    return handler(state, action as never);
  }
  return state;
}

/**
 * Context value interfaces
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
  setMode: (mode: "edit" | "view") => void;
  setLinkLabelMode: (mode: LinkLabelMode) => void;
  toggleDummyLinks: () => void;
  setEndpointLabelOffset: (value: number) => void;
  saveEndpointLabelOffset: () => void;
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
  upsertEdgeAnnotation: (annotation: EdgeAnnotation) => void;
  setCustomNodes: (customNodes: CustomNodeTemplate[], defaultNode: string) => void;
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void;
  setProcessing: (isProcessing: boolean, mode?: "deploy" | "destroy") => void;
  refreshEditorData: () => void;
  clearCustomNodeError: () => void;
  clearSelectionForDeletedNode: (nodeId: string) => void;
  clearSelectionForDeletedEdge: (edgeId: string) => void;
}

const TopoViewerStateContext = createContext<TopoViewerStateContextValue | undefined>(undefined);
const TopoViewerActionsContext = createContext<TopoViewerActionsContextValue | undefined>(
  undefined
);

interface TopoViewerProviderProps {
  children: ReactNode;
  initialData?: unknown;
}

/**
 * Parse initial data from extension (UI state only)
 */
function parseInitialData(data: unknown): Partial<TopoViewerState> {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const result: Partial<TopoViewerState> = {
    labName: (obj.labName as string) || "",
    mode: (obj.mode as "edit" | "view") || "edit",
    deploymentState: (obj.deploymentState as DeploymentState) || "unknown",
    customNodes: (obj.customNodes as CustomNodeTemplate[]) || [],
    defaultNode: (obj.defaultNode as string) || "",
    customIcons: (obj.customIcons as CustomIconInfo[]) || []
  };
  if (typeof obj.isLocked === "boolean") {
    result.isLocked = obj.isLocked;
  }
  const viewerSettings = obj.viewerSettings as Record<string, unknown> | undefined;
  if (viewerSettings) {
    const offset = parseEndpointLabelOffset(viewerSettings.endpointLabelOffset);
    if (offset !== null) {
      result.endpointLabelOffset = offset;
    }
  }
  if (Array.isArray(obj.edgeAnnotations)) {
    result.edgeAnnotations = obj.edgeAnnotations as EdgeAnnotation[];
  }
  return result;
}

/**
 * Handle incoming extension messages (UI-related only)
 */
type ExtensionMessage = {
  type?: string;
  data?: Record<string, unknown>;
  action?: string;
  nodeId?: string;
  edgeId?: string;
};

function handlePanelAction(
  message: ExtensionMessage,
  dispatch: React.Dispatch<TopoViewerAction>
): void {
  const action = message.action;
  const nodeId = message.nodeId as string | undefined;
  const edgeId = message.edgeId as string | undefined;
  if (!action) return;

  if (action === "edit-node" && nodeId) {
    dispatch({ type: "EDIT_NODE", payload: nodeId });
    return;
  }
  if (action === "edit-link" && edgeId) {
    dispatch({ type: "EDIT_EDGE", payload: edgeId });
    return;
  }
  if (action === "node-info" && nodeId) {
    dispatch({ type: "SELECT_NODE", payload: nodeId });
    return;
  }
  if (action === "link-info" && edgeId) {
    dispatch({ type: "SELECT_EDGE", payload: edgeId });
  }
}

function handleExtensionMessage(
  message: ExtensionMessage,
  dispatch: React.Dispatch<TopoViewerAction>
): void {
  if (!message.type) return;

  const handlers: Record<string, () => void> = {
    "topo-mode-changed": () => {
      if (message.data?.mode) {
        const modeValue = message.data.mode;
        const normalizedMode = modeValue === "viewer" || modeValue === "view" ? "view" : "edit";
        dispatch({ type: "SET_MODE", payload: normalizedMode });
      }
      if (message.data?.deploymentState) {
        dispatch({
          type: "SET_DEPLOYMENT_STATE",
          payload: message.data.deploymentState as DeploymentState
        });
      }
    },
    "panel-action": () => handlePanelAction(message, dispatch),
    "custom-nodes-updated": () => {
      const customNodes = (message as unknown as { customNodes?: CustomNodeTemplate[] })
        .customNodes;
      const defaultNode = (message as unknown as { defaultNode?: string }).defaultNode;
      if (customNodes !== undefined) {
        dispatch({
          type: "SET_CUSTOM_NODES",
          payload: { customNodes, defaultNode: defaultNode || "" }
        });
      }
    },
    "custom-node-error": () => {
      const error = (message as unknown as { error?: string }).error;
      if (error) {
        dispatch({ type: "SET_CUSTOM_NODE_ERROR", payload: error });
      }
    },
    "icon-list-response": () => {
      const icons = (message as unknown as { icons?: CustomIconInfo[] }).icons;
      if (icons !== undefined) {
        dispatch({ type: "SET_CUSTOM_ICONS", payload: icons });
      }
    },
    "lab-lifecycle-status": () => {
      dispatch({ type: "SET_PROCESSING", payload: { isProcessing: false, mode: null } });
    }
  };

  handlers[message.type]?.();
}

/**
 * Selection action creators
 */
function useSelectionActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const selectNode = useCallback(
    (nodeId: string | null) => {
      dispatch({ type: "SELECT_NODE", payload: nodeId });
    },
    [dispatch]
  );
  const selectEdge = useCallback(
    (edgeId: string | null) => {
      dispatch({ type: "SELECT_EDGE", payload: edgeId });
    },
    [dispatch]
  );
  const editNode = useCallback(
    (nodeId: string | null) => {
      dispatch({ type: "EDIT_NODE", payload: nodeId });
    },
    [dispatch]
  );
  const editEdge = useCallback(
    (edgeId: string | null) => {
      dispatch({ type: "EDIT_EDGE", payload: edgeId });
    },
    [dispatch]
  );
  const editNetwork = useCallback(
    (nodeId: string | null) => {
      dispatch({ type: "EDIT_NETWORK", payload: nodeId });
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      selectNode,
      selectEdge,
      editNode,
      editEdge,
      editNetwork
    }),
    [selectNode, selectEdge, editNode, editEdge, editNetwork]
  );
}

/**
 * UI state action creators
 */
function useUIStateActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const toggleLock = useCallback(() => {
    dispatch({ type: "TOGGLE_LOCK" });
  }, [dispatch]);
  const setMode = useCallback(
    (mode: "edit" | "view") => {
      dispatch({ type: "SET_MODE", payload: mode });
    },
    [dispatch]
  );
  const setLinkLabelMode = useCallback(
    (mode: LinkLabelMode) => {
      dispatch({ type: "SET_LINK_LABEL_MODE", payload: mode });
    },
    [dispatch]
  );
  const toggleDummyLinks = useCallback(() => {
    dispatch({ type: "TOGGLE_DUMMY_LINKS" });
  }, [dispatch]);
  const setEndpointLabelOffset = useCallback(
    (value: number) => {
      const next = Number.isFinite(value)
        ? clampEndpointLabelOffset(value)
        : DEFAULT_ENDPOINT_LABEL_OFFSET;
      dispatch({ type: "SET_ENDPOINT_LABEL_OFFSET", payload: next });
    },
    [dispatch]
  );
  const setEdgeAnnotations = useCallback(
    (annotations: EdgeAnnotation[]) => {
      dispatch({ type: "SET_EDGE_ANNOTATIONS", payload: annotations });
    },
    [dispatch]
  );
  const upsertEdgeAnnotationAction = useCallback(
    (annotation: EdgeAnnotation) => {
      dispatch({ type: "UPSERT_EDGE_ANNOTATION", payload: annotation });
    },
    [dispatch]
  );
  const setCustomNodes = useCallback(
    (customNodes: CustomNodeTemplate[], defaultNode: string) => {
      dispatch({ type: "SET_CUSTOM_NODES", payload: { customNodes, defaultNode } });
    },
    [dispatch]
  );
  const editCustomTemplate = useCallback(
    (data: CustomTemplateEditorData | null) => {
      dispatch({ type: "EDIT_CUSTOM_TEMPLATE", payload: data });
    },
    [dispatch]
  );
  const setProcessing = useCallback(
    (isProcessing: boolean, mode?: "deploy" | "destroy") => {
      dispatch({ type: "SET_PROCESSING", payload: { isProcessing, mode: mode ?? null } });
    },
    [dispatch]
  );
  const refreshEditorData = useCallback(() => {
    dispatch({ type: "REFRESH_EDITOR_DATA" });
  }, [dispatch]);
  const clearCustomNodeError = useCallback(() => {
    dispatch({ type: "SET_CUSTOM_NODE_ERROR", payload: null });
  }, [dispatch]);
  const clearSelectionForDeletedNode = useCallback(
    (nodeId: string) => {
      dispatch({ type: "CLEAR_SELECTION_FOR_DELETED_NODE", payload: nodeId });
    },
    [dispatch]
  );
  const clearSelectionForDeletedEdge = useCallback(
    (edgeId: string) => {
      dispatch({ type: "CLEAR_SELECTION_FOR_DELETED_EDGE", payload: edgeId });
    },
    [dispatch]
  );

  return useMemo(
    () => ({
      toggleLock,
      setMode,
      setLinkLabelMode,
      toggleDummyLinks,
      setEndpointLabelOffset,
      setEdgeAnnotations,
      upsertEdgeAnnotation: upsertEdgeAnnotationAction,
      setCustomNodes,
      editCustomTemplate,
      setProcessing,
      refreshEditorData,
      clearCustomNodeError,
      clearSelectionForDeletedNode,
      clearSelectionForDeletedEdge
    }),
    [
      toggleLock,
      setMode,
      setLinkLabelMode,
      toggleDummyLinks,
      setEndpointLabelOffset,
      setEdgeAnnotations,
      upsertEdgeAnnotationAction,
      setCustomNodes,
      editCustomTemplate,
      setProcessing,
      refreshEditorData,
      clearCustomNodeError,
      clearSelectionForDeletedNode,
      clearSelectionForDeletedEdge
    ]
  );
}

/**
 * Combined action creators
 */
function useActions(dispatch: React.Dispatch<TopoViewerAction>) {
  const selectionActions = useSelectionActions(dispatch);
  const uiStateActions = useUIStateActions(dispatch);

  return useMemo(
    () => ({
      ...selectionActions,
      ...uiStateActions
    }),
    [selectionActions, uiStateActions]
  );
}

/**
 * TopoViewer Context Provider
 */
export const TopoViewerProvider: React.FC<TopoViewerProviderProps> = ({
  children,
  initialData
}) => {
  const initialEdgeAnnotationCleanupRef = useRef(false);
  const [state, dispatch] = useReducer(topoViewerReducer, initialData, (initial) => {
    try {
      const parsed = parseInitialData(initial);
      return { ...initialState, ...parsed };
    } catch {
      return initialState;
    }
  });
  const actions = useActions(dispatch);

  // Listen for UI-related messages from extension
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (message && typeof message === "object" && message.type) {
        handleExtensionMessage(message, dispatch);
      }
    };
    return subscribeToWebviewMessages(handleMessage);
  }, [dispatch]);

  useEffect(() => {
    if (!initialEdgeAnnotationCleanupRef.current) return;
    initialEdgeAnnotationCleanupRef.current = false;
    void saveEdgeAnnotations(state.edgeAnnotations);
  }, [state.edgeAnnotations]);

  const stateValue = useMemo<TopoViewerStateContextValue>(
    () => ({
      state,
      dispatch
    }),
    [state, dispatch]
  );

  const saveEndpointLabelOffset = useCallback(() => {
    void saveViewerSettings({ endpointLabelOffset: state.endpointLabelOffset });
  }, [state.endpointLabelOffset]);

  const actionsValue = useMemo<TopoViewerActionsContextValue>(
    () => ({
      ...actions,
      saveEndpointLabelOffset
    }),
    [actions, saveEndpointLabelOffset]
  );

  return (
    <TopoViewerStateContext.Provider value={stateValue}>
      <TopoViewerActionsContext.Provider value={actionsValue}>
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
    throw new Error("useTopoViewerState must be used within a TopoViewerProvider");
  }
  return context;
};

/**
 * Hook to use TopoViewer actions (stable)
 */
export const useTopoViewerActions = (): TopoViewerActionsContextValue => {
  const context = useContext(TopoViewerActionsContext);
  if (context === undefined) {
    throw new Error("useTopoViewerActions must be used within a TopoViewerProvider");
  }
  return context;
};

/**
 * Legacy combined hook
 */
export const useTopoViewer = (): TopoViewerStateContextValue & TopoViewerActionsContextValue => {
  const stateContext = useTopoViewerState();
  const actionsContext = useTopoViewerActions();
  return useMemo(() => ({ ...stateContext, ...actionsContext }), [stateContext, actionsContext]);
};
