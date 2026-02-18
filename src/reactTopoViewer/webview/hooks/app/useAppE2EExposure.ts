/**
 * useAppE2EExposure - wires E2E test helpers for AppContent.
 */
import type { ReactFlowInstance } from "@xyflow/react";

import type { TopoViewerActions, TopoViewerState } from "../../stores/topoViewerStore";
import type { useLayoutControls } from "../ui";
import type { GroupStyleAnnotation } from "../../../shared/types/topology";

import type { GraphCreationReturn } from "./useGraphCreation";
import type { UndoRedoControls } from "./useUndoRedoControls";
import { useE2ETestingExposure } from "./useAppHelpers";
import type { AppGraphHandlers } from "./useAppGraphHandlers";

type LayoutControls = ReturnType<typeof useLayoutControls>;

interface AppE2EExposureParams {
  state: Pick<TopoViewerState, "isLocked" | "mode" | "selectedNode" | "selectedEdge">;
  actions: Pick<
    TopoViewerActions,
    "toggleLock" | "editNode" | "editNetwork" | "selectNode" | "selectEdge" | "setMode"
  >;
  undoRedo: Pick<UndoRedoControls, "canUndo" | "canRedo">;
  graphHandlers: Pick<AppGraphHandlers, "handleEdgeCreated" | "handleNodeCreatedCallback">;
  annotations: {
    handleAddGroup: () => void;
    getGroups: () => GroupStyleAnnotation[];
  };
  graphCreation: Pick<GraphCreationReturn, "createNetworkAtPosition">;
  layoutControls: LayoutControls;
  rfInstance: ReactFlowInstance | null;
}

export function useAppE2EExposure({
  state,
  actions,
  undoRedo,
  graphHandlers,
  annotations,
  graphCreation,
  layoutControls,
  rfInstance
}: AppE2EExposureParams): void {
  useE2ETestingExposure({
    isLocked: state.isLocked,
    mode: state.mode,
    toggleLock: actions.toggleLock,
    setMode: actions.setMode,
    undoRedo,
    handleEdgeCreated: graphHandlers.handleEdgeCreated,
    handleNodeCreatedCallback: graphHandlers.handleNodeCreatedCallback,
    handleAddGroup: annotations.handleAddGroup,
    createNetworkAtPosition: graphCreation.createNetworkAtPosition,
    editNode: actions.editNode,
    editNetwork: actions.editNetwork,
    getGroups: annotations.getGroups,
    elements: [],
    setLayout: layoutControls.setLayout,
    isGeoLayout: layoutControls.isGeoLayout,
    rfInstance,
    selectedNode: state.selectedNode,
    selectedEdge: state.selectedEdge,
    selectNode: actions.selectNode,
    selectEdge: actions.selectEdge
  });
}
