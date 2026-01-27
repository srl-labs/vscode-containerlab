/**
 * useTopoViewerCompat - Compatibility hook bridging old TopoViewerContext API to Zustand stores
 *
 * This hook provides the same interface as the old useTopoViewer/useTopoViewerState/useTopoViewerActions
 * hooks but is backed by the topoViewerStore.
 */
import { useMemo } from "react";

import type { CustomNodeTemplate, CustomTemplateEditorData } from "../../shared/types/editors";
import type { EdgeAnnotation } from "../../shared/types/topology";
import type { CustomIconInfo } from "../../shared/types/icons";
import { saveEdgeAnnotations, saveViewerSettings } from "../services";
import {
  useTopoViewerStore,
  type DeploymentState,
  type LinkLabelMode,
  type ProcessingMode
} from "../stores/topoViewerStore";

// ============================================================================
// Types (matching old TopoViewerContext types)
// ============================================================================

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

export interface TopoViewerStateContextValue {
  state: TopoViewerState;
  dispatch: React.Dispatch<unknown>; // Kept for compatibility but not used with stores
}

export interface TopoViewerActionsContextValue {
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

// ============================================================================
// Compatibility Hooks
// ============================================================================

/**
 * Hook to use TopoViewer state + dispatch
 * Compatible with old useTopoViewerState() API
 */
export function useTopoViewerState(): TopoViewerStateContextValue {
  const state = useTopoViewerStore((s) => ({
    labName: s.labName,
    mode: s.mode,
    deploymentState: s.deploymentState,
    selectedNode: s.selectedNode,
    selectedEdge: s.selectedEdge,
    editingNode: s.editingNode,
    editingEdge: s.editingEdge,
    editingNetwork: s.editingNetwork,
    isLocked: s.isLocked,
    linkLabelMode: s.linkLabelMode,
    showDummyLinks: s.showDummyLinks,
    endpointLabelOffsetEnabled: s.endpointLabelOffsetEnabled,
    endpointLabelOffset: s.endpointLabelOffset,
    edgeAnnotations: s.edgeAnnotations,
    customNodes: s.customNodes,
    defaultNode: s.defaultNode,
    customIcons: s.customIcons,
    editingCustomTemplate: s.editingCustomTemplate,
    isProcessing: s.isProcessing,
    processingMode: s.processingMode,
    editorDataVersion: s.editorDataVersion,
    customNodeError: s.customNodeError
  }));

  // Dispatch is a no-op for compatibility; stores use actions directly
  const dispatch = useMemo(() => (() => {}) as React.Dispatch<unknown>, []);

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}

/**
 * Hook to use TopoViewer actions (stable)
 * Compatible with old useTopoViewerActions() API
 */
export function useTopoViewerActions(): TopoViewerActionsContextValue {
  const storeState = useTopoViewerStore.getState();
  const endpointLabelOffset = useTopoViewerStore((s) => s.endpointLabelOffset);

  return useMemo(
    () => ({
      selectNode: storeState.selectNode,
      selectEdge: storeState.selectEdge,
      editNode: storeState.editNode,
      editEdge: storeState.editEdge,
      editNetwork: storeState.editNetwork,
      toggleLock: storeState.toggleLock,
      setMode: storeState.setMode,
      setLinkLabelMode: storeState.setLinkLabelMode,
      toggleDummyLinks: storeState.toggleDummyLinks,
      setEndpointLabelOffset: storeState.setEndpointLabelOffset,
      saveEndpointLabelOffset: () => {
        void saveViewerSettings({ endpointLabelOffset });
      },
      setEdgeAnnotations: (annotations: EdgeAnnotation[]) => {
        storeState.setEdgeAnnotations(annotations);
        void saveEdgeAnnotations(annotations);
      },
      upsertEdgeAnnotation: storeState.upsertEdgeAnnotation,
      setCustomNodes: storeState.setCustomNodes,
      editCustomTemplate: storeState.editCustomTemplate,
      setProcessing: storeState.setProcessing,
      refreshEditorData: storeState.refreshEditorData,
      clearCustomNodeError: storeState.clearCustomNodeError,
      clearSelectionForDeletedNode: storeState.clearSelectionForDeletedNode,
      clearSelectionForDeletedEdge: storeState.clearSelectionForDeletedEdge
    }),
    [storeState, endpointLabelOffset]
  );
}

/**
 * Legacy combined hook
 * Compatible with old useTopoViewer() API
 */
export function useTopoViewer(): TopoViewerStateContextValue & TopoViewerActionsContextValue {
  const stateContext = useTopoViewerState();
  const actionsContext = useTopoViewerActions();
  return useMemo(() => ({ ...stateContext, ...actionsContext }), [stateContext, actionsContext]);
}

// Re-export types for compatibility
export type { DeploymentState, LinkLabelMode, ProcessingMode };
