/**
 * topoViewerStore - Zustand store for TopoViewer UI state
 *
 * This store handles UI state, selections, editing state, and settings.
 * Graph data (nodes/edges) is managed separately in graphStore.
 */
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";

import type { CustomNodeTemplate, CustomTemplateEditorData } from "../../shared/types/editors";
import type { EdgeAnnotation } from "../../shared/types/topology";
import type { CustomIconInfo } from "../../shared/types/icons";
import type { LabSettings } from "../../shared/types/labSettings";
import { upsertEdgeAnnotation } from "../annotations/edgeAnnotations";
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  clampEndpointLabelOffset
} from "../annotations/endpointLabelOffset";

// ============================================================================
// Types
// ============================================================================

export type DeploymentState = "deployed" | "undeployed" | "unknown";
export type LinkLabelMode = "show-all" | "on-select" | "hide";
export type ProcessingMode = "deploy" | "destroy" | null;

export interface TopoViewerState {
  labName: string;
  mode: "edit" | "view";
  deploymentState: DeploymentState;
  labSettings?: LabSettings;
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
  canUndo: boolean;
  canRedo: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  customIcons: CustomIconInfo[];
  editingCustomTemplate: CustomTemplateEditorData | null;
  isProcessing: boolean;
  processingMode: ProcessingMode;
  editorDataVersion: number;
  customNodeError: string | null;
}

export interface TopoViewerActions {
  // Selection (mutually exclusive)
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;

  // Editing (mutually exclusive, clears selection)
  editNode: (nodeId: string | null) => void;
  editEdge: (edgeId: string | null) => void;
  editNetwork: (nodeId: string | null) => void;

  // Mode and state
  setMode: (mode: "edit" | "view") => void;
  setDeploymentState: (state: DeploymentState) => void;
  toggleLock: () => void;

  // Rendering settings
  setLinkLabelMode: (mode: LinkLabelMode) => void;
  toggleDummyLinks: () => void;
  toggleEndpointLabelOffset: () => void;
  setEndpointLabelOffset: (value: number) => void;

  // Edge annotations
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
  upsertEdgeAnnotation: (annotation: EdgeAnnotation) => void;

  // Custom nodes
  setCustomNodes: (customNodes: CustomNodeTemplate[], defaultNode: string) => void;
  setCustomIcons: (icons: CustomIconInfo[]) => void;
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void;
  setCustomNodeError: (error: string | null) => void;
  clearCustomNodeError: () => void;

  // Processing state
  setProcessing: (isProcessing: boolean, mode?: "deploy" | "destroy") => void;

  // Data refresh
  refreshEditorData: () => void;

  // Cleanup helpers
  clearSelectionForDeletedNode: (nodeId: string) => void;
  clearSelectionForDeletedEdge: (edgeId: string) => void;

  // Initial data
  setInitialData: (data: Partial<TopoViewerState>) => void;
}

export type TopoViewerStore = TopoViewerState & TopoViewerActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: TopoViewerState = {
  labName: "",
  mode: "edit",
  deploymentState: "unknown",
  labSettings: undefined,
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
  canUndo: false,
  canRedo: false,
  customNodes: [],
  defaultNode: "",
  customIcons: [],
  editingCustomTemplate: null,
  isProcessing: false,
  processingMode: null,
  editorDataVersion: 0,
  customNodeError: null
};

// ============================================================================
// Helper Functions
// ============================================================================

/** Parse non-topology bootstrap data from extension/dev host */
export function parseInitialData(data: unknown): Partial<TopoViewerState> {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  return {
    customNodes: (obj.customNodes as CustomNodeTemplate[]) || [],
    defaultNode: (obj.defaultNode as string) || "",
    customIcons: (obj.customIcons as CustomIconInfo[]) || []
  };
}

// ============================================================================
// Store Creation
// ============================================================================

export const useTopoViewerStore = createWithEqualityFn<TopoViewerStore>((set) => ({
  ...initialState,

  // Selection (mutually exclusive)
  selectNode: (nodeId) => {
    set({ selectedNode: nodeId, selectedEdge: null });
  },

  selectEdge: (edgeId) => {
    set({ selectedEdge: edgeId, selectedNode: null });
  },

  // Editing (mutually exclusive, clears selection)
  editNode: (nodeId) => {
    set({
      editingNode: nodeId,
      editingEdge: null,
      editingNetwork: null,
      selectedNode: null,
      selectedEdge: null
    });
  },

  editEdge: (edgeId) => {
    set({
      editingEdge: edgeId,
      editingNode: null,
      editingNetwork: null,
      selectedNode: null,
      selectedEdge: null
    });
  },

  editNetwork: (nodeId) => {
    set({
      editingNetwork: nodeId,
      editingNode: null,
      editingEdge: null,
      selectedNode: null,
      selectedEdge: null
    });
  },

  // Mode and state
  setMode: (mode) => {
    set({ mode });
  },

  setDeploymentState: (deploymentState) => {
    set({ deploymentState });
  },

  toggleLock: () => {
    set((state) => ({ isLocked: !state.isLocked }));
  },

  // Rendering settings
  setLinkLabelMode: (linkLabelMode) => {
    set({ linkLabelMode });
  },

  toggleDummyLinks: () => {
    set((state) => ({ showDummyLinks: !state.showDummyLinks }));
  },

  toggleEndpointLabelOffset: () => {
    set((state) => ({ endpointLabelOffsetEnabled: !state.endpointLabelOffsetEnabled }));
  },

  setEndpointLabelOffset: (value) => {
    const next = Number.isFinite(value)
      ? clampEndpointLabelOffset(value)
      : DEFAULT_ENDPOINT_LABEL_OFFSET;
    set({ endpointLabelOffset: next });
  },

  // Edge annotations
  setEdgeAnnotations: (edgeAnnotations) => {
    set({ edgeAnnotations });
  },

  upsertEdgeAnnotation: (annotation) => {
    set((state) => ({
      edgeAnnotations: upsertEdgeAnnotation(state.edgeAnnotations, annotation)
    }));
  },

  // Custom nodes
  setCustomNodes: (customNodes, defaultNode) => {
    set({ customNodes, defaultNode, customNodeError: null });
  },

  setCustomIcons: (customIcons) => {
    set({ customIcons });
  },

  editCustomTemplate: (editingCustomTemplate) => {
    set((state) => ({
      editingCustomTemplate,
      editingNode: editingCustomTemplate ? null : state.editingNode,
      editingEdge: editingCustomTemplate ? null : state.editingEdge,
      editingNetwork: editingCustomTemplate ? null : state.editingNetwork,
      selectedNode: editingCustomTemplate ? null : state.selectedNode,
      selectedEdge: editingCustomTemplate ? null : state.selectedEdge
    }));
  },

  setCustomNodeError: (customNodeError) => {
    set({ customNodeError });
  },

  clearCustomNodeError: () => {
    set({ customNodeError: null });
  },

  // Processing state
  setProcessing: (isProcessing, mode) => {
    set({ isProcessing, processingMode: mode ?? null });
  },

  // Data refresh
  refreshEditorData: () => {
    set((state) => ({ editorDataVersion: state.editorDataVersion + 1 }));
  },

  // Cleanup helpers
  clearSelectionForDeletedNode: (nodeId) => {
    set((state) => ({
      selectedNode: state.selectedNode === nodeId ? null : state.selectedNode,
      editingNode: state.editingNode === nodeId ? null : state.editingNode,
      editingNetwork: state.editingNetwork === nodeId ? null : state.editingNetwork
    }));
  },

  clearSelectionForDeletedEdge: (edgeId) => {
    set((state) => ({
      selectedEdge: state.selectedEdge === edgeId ? null : state.selectedEdge,
      editingEdge: state.editingEdge === edgeId ? null : state.editingEdge
    }));
  },

  // Initial data
  setInitialData: (data) => {
    set(data);
  }
}));

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

/** Get mode */
export const useMode = () => useTopoViewerStore((state) => state.mode);

/** Get lab name */
export const useLabName = () => useTopoViewerStore((state) => state.labName);

/** Get deployment state */
export const useDeploymentState = () => useTopoViewerStore((state) => state.deploymentState);

/** Get selected node */
export const useSelectedNode = () => useTopoViewerStore((state) => state.selectedNode);

/** Get selected edge */
export const useSelectedEdge = () => useTopoViewerStore((state) => state.selectedEdge);

/** Get editing node */
export const useEditingNode = () => useTopoViewerStore((state) => state.editingNode);

/** Get editing edge */
export const useEditingEdge = () => useTopoViewerStore((state) => state.editingEdge);

/** Get lock state */
export const useIsLocked = () => useTopoViewerStore((state) => state.isLocked);

/** Get link label mode */
export const useLinkLabelMode = () => useTopoViewerStore((state) => state.linkLabelMode);

/** Get dummy link visibility */
export const useShowDummyLinks = () => useTopoViewerStore((state) => state.showDummyLinks);

/** Get endpoint label offset */
export const useEndpointLabelOffset = () =>
  useTopoViewerStore((state) => state.endpointLabelOffset);

/** Get processing state */
export const useIsProcessing = () => useTopoViewerStore((state) => state.isProcessing);

/** Get processing mode */
export const useProcessingMode = () => useTopoViewerStore((state) => state.processingMode);

/** Get edge annotations */
export const useEdgeAnnotations = () => useTopoViewerStore((state) => state.edgeAnnotations);

/** Get custom nodes */
export const useCustomNodes = () => useTopoViewerStore((state) => state.customNodes);

/** Get custom icons */
export const useCustomIcons = () => useTopoViewerStore((state) => state.customIcons);

/** Get TopoViewer state (convenience) */
export const useTopoViewerState = () =>
  useTopoViewerStore(
    (state) => ({
      labName: state.labName,
      mode: state.mode,
      deploymentState: state.deploymentState,
      labSettings: state.labSettings,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge,
      editingNode: state.editingNode,
      editingEdge: state.editingEdge,
      editingNetwork: state.editingNetwork,
      isLocked: state.isLocked,
      linkLabelMode: state.linkLabelMode,
      showDummyLinks: state.showDummyLinks,
      endpointLabelOffsetEnabled: state.endpointLabelOffsetEnabled,
      endpointLabelOffset: state.endpointLabelOffset,
      edgeAnnotations: state.edgeAnnotations,
      customNodes: state.customNodes,
      defaultNode: state.defaultNode,
      customIcons: state.customIcons,
      editingCustomTemplate: state.editingCustomTemplate,
      isProcessing: state.isProcessing,
      processingMode: state.processingMode,
      editorDataVersion: state.editorDataVersion,
      customNodeError: state.customNodeError
    }),
    shallow
  );

/** Get TopoViewer actions (stable reference) */
export const useTopoViewerActions = () =>
  useTopoViewerStore(
    (state) => ({
      selectNode: state.selectNode,
      selectEdge: state.selectEdge,
      editNode: state.editNode,
      editEdge: state.editEdge,
      editNetwork: state.editNetwork,
      setMode: state.setMode,
      setDeploymentState: state.setDeploymentState,
      toggleLock: state.toggleLock,
      setLinkLabelMode: state.setLinkLabelMode,
      toggleDummyLinks: state.toggleDummyLinks,
      toggleEndpointLabelOffset: state.toggleEndpointLabelOffset,
      setEndpointLabelOffset: state.setEndpointLabelOffset,
      setEdgeAnnotations: state.setEdgeAnnotations,
      upsertEdgeAnnotation: state.upsertEdgeAnnotation,
      setCustomNodes: state.setCustomNodes,
      setCustomIcons: state.setCustomIcons,
      editCustomTemplate: state.editCustomTemplate,
      setCustomNodeError: state.setCustomNodeError,
      clearCustomNodeError: state.clearCustomNodeError,
      setProcessing: state.setProcessing,
      refreshEditorData: state.refreshEditorData,
      clearSelectionForDeletedNode: state.clearSelectionForDeletedNode,
      clearSelectionForDeletedEdge: state.clearSelectionForDeletedEdge,
      setInitialData: state.setInitialData
    }),
    shallow
  );
