/**
 * AppContext - Single top-level provider/store for React TopoViewer.
 *
 * Consolidates graph, UI, annotations, and undo/redo into one provider to
 * avoid deep context nesting. Consumers use selector hooks to pick slices.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import type {
  AnnotationStateContextValue,
  AnnotationActionsContextValue
} from "./AnnotationContext";
import type {
  TopoViewerStateContextValue,
  TopoViewerActionsContextValue
} from "./TopoViewerContext";
import type { GraphActions, GraphContextValue, GraphState } from "./GraphContext";
import type { UseUndoRedoReturn } from "../hooks/state/useUndoRedo";
import { useGraphModel } from "./GraphContext";
import { useTopoViewerModel } from "./TopoViewerContext";
import { useUndoRedoModel } from "./UndoRedoContext";
import { useAnnotationModel } from "./AnnotationContext";

interface AppState {
  graph: GraphState;
  topo: TopoViewerStateContextValue;
  annotations: AnnotationStateContextValue;
  undoRedo: UseUndoRedoReturn;
}

interface AppActions {
  graph: GraphActions;
  topo: TopoViewerActionsContextValue;
  annotations: AnnotationActionsContextValue;
}

interface AppStore {
  getState: () => AppState;
  setState: (next: AppState) => void;
  getActions: () => AppActions;
  setActions: (next: AppActions) => void;
  subscribe: (listener: () => void) => () => void;
}

function createAppStore(initialState: AppState, initialActions: AppActions): AppStore {
  let state = initialState;
  let actions = initialActions;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next: AppState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    getActions: () => actions,
    setActions: (next: AppActions) => {
      actions = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const AppStoreContext = createContext<AppStore | null>(null);

function useStoreSelector<T>(
  store: AppStore,
  selector: (state: AppState) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
): T {
  const selectedRef = useRef<T>(selector(store.getState()));

  const getSnapshot = useCallback(() => {
    const next = selector(store.getState());
    if (!isEqual(selectedRef.current, next)) {
      selectedRef.current = next;
    }
    return selectedRef.current;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useAppSelector<T>(
  selector: (state: AppState) => T,
  isEqual?: (left: T, right: T) => boolean
): T {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppSelector must be used within an AppProvider");
  }
  return useStoreSelector(store, selector, isEqual ?? Object.is);
}

export function useAppActionsSelector<T>(selector: (actions: AppActions) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppActionsSelector must be used within an AppProvider");
  }
  return selector(store.getActions());
}

export interface AppProviderProps {
  children: React.ReactNode;
  initialData?: unknown;
  initialNodes: TopoNode[];
  initialEdges: TopoEdge[];
  rfInstance: ReactFlowInstance | null;
  onLockedAction?: () => void;
}

export const AppProvider: React.FC<AppProviderProps> = ({
  children,
  initialData,
  initialNodes,
  initialEdges,
  rfInstance,
  onLockedAction
}) => {
  const { state: topoState, actions: topoActions, dispatch } = useTopoViewerModel(initialData);

  const { state: graphState, actions: graphActions } = useGraphModel({
    initialNodes,
    initialEdges,
    onEdgeAnnotationsUpdate: topoActions.setEdgeAnnotations
  });

  const undoRedo = useUndoRedoModel({
    enabled: topoState.mode === "edit",
    graphState,
    graphActions,
    edgeAnnotations: topoState.edgeAnnotations,
    setEdgeAnnotations: topoActions.setEdgeAnnotations
  });

  const graphContextValue = useMemo<GraphContextValue>(
    () => ({
      ...graphState,
      ...graphActions
    }),
    [graphState, graphActions]
  );

  const { state: annotationState, actions: annotationActions } = useAnnotationModel({
    graph: graphContextValue,
    undoRedo,
    rfInstance,
    mode: topoState.mode,
    isLocked: topoState.isLocked,
    onLockedAction: onLockedAction ?? (() => {})
  });

  const state = useMemo<AppState>(
    () => ({
      graph: graphState,
      topo: { state: topoState, dispatch },
      annotations: annotationState,
      undoRedo
    }),
    [graphState, topoState, dispatch, annotationState, undoRedo]
  );

  const actions = useMemo<AppActions>(
    () => ({
      graph: graphActions,
      topo: topoActions,
      annotations: annotationActions
    }),
    [graphActions, topoActions, annotationActions]
  );

  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppStore(state, actions);
  }

  useEffect(() => {
    storeRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    storeRef.current?.setActions(actions);
  }, [actions]);

  return <AppStoreContext.Provider value={storeRef.current}>{children}</AppStoreContext.Provider>;
};
