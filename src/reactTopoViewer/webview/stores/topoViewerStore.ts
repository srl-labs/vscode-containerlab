// Zustand store for TopoViewer UI state.
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";

import type { CustomNodeTemplate, CustomTemplateEditorData } from "../../shared/types/editors";
import type { EdgeAnnotation } from "../../shared/types/topology";
import type { CustomIconInfo } from "../../shared/types/icons";
import type { LabSettings } from "../../shared/types/labSettings";
import { upsertEdgeAnnotation } from "../annotations/edgeAnnotations";
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  clampEndpointLabelOffset,
} from "../annotations/endpointLabelOffset";

import { useAnnotationUIStore } from "./annotationUIStore";

// ============================================================================
// Types
// ============================================================================

export type DeploymentState = "deployed" | "undeployed" | "unknown";
export type LinkLabelMode = "show-all" | "on-select" | "hide";
export type ProcessingMode = "deploy" | "destroy" | null;
export type LifecycleLogStream = "stdout" | "stderr";
export type LifecycleStatus = "running" | "success" | "error" | null;

export interface LifecycleLogEntry {
  line: string;
  stream: LifecycleLogStream;
}

export interface TopoViewerState {
  labName: string;
  mode: "edit" | "view";
  deploymentState: DeploymentState;
  labSettings?: LabSettings;
  yamlFileName: string;
  annotationsFileName: string;
  /** Raw YAML content from host snapshot (used by Monaco source editors). */
  yamlContent: string;
  /** Raw annotations JSON content from host snapshot (used by Monaco source editors). */
  annotationsContent: string;
  selectedNode: string | null;
  selectedEdge: string | null;
  editingImpairment: string | null;
  editingNode: string | null;
  editingEdge: string | null;
  editingNetwork: string | null;
  isLocked: boolean;
  linkLabelMode: LinkLabelMode;
  showDummyLinks: boolean;
  endpointLabelOffsetEnabled: boolean;
  endpointLabelOffset: number;
  gridColor: string | null;
  gridBgColor: string | null;
  edgeAnnotations: EdgeAnnotation[];
  canUndo: boolean;
  canRedo: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  customIcons: CustomIconInfo[];
  editingCustomTemplate: CustomTemplateEditorData | null;
  isProcessing: boolean;
  processingMode: ProcessingMode;
  lifecycleModalOpen: boolean;
  lifecycleStatus: LifecycleStatus;
  lifecycleStatusMessage: string | null;
  lifecycleLogs: LifecycleLogEntry[];
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
  editImpairment: (edgeId: string | null) => void;
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
  setGridColor: (color: string | null) => void;
  setGridBgColor: (color: string | null) => void;

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
  setLifecycleStatus: (status: LifecycleStatus, message?: string | null) => void;
  appendLifecycleLog: (line: string, stream?: LifecycleLogStream) => void;
  clearLifecycleLogs: () => void;
  closeLifecycleModal: () => void;

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
  yamlFileName: "topology.clab.yml",
  annotationsFileName: "topology.clab.yml.annotations.json",
  yamlContent: "",
  annotationsContent: "{}\n",
  selectedNode: null,
  selectedEdge: null,
  editingImpairment: null,
  editingNode: null,
  editingEdge: null,
  editingNetwork: null,
  isLocked: true,
  linkLabelMode: "show-all",
  showDummyLinks: true,
  endpointLabelOffsetEnabled: true,
  endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
  gridColor: null,
  gridBgColor: null,
  edgeAnnotations: [],
  canUndo: false,
  canRedo: false,
  customNodes: [],
  defaultNode: "",
  customIcons: [],
  editingCustomTemplate: null,
  isProcessing: false,
  processingMode: null,
  lifecycleModalOpen: false,
  lifecycleStatus: null,
  lifecycleStatusMessage: null,
  lifecycleLogs: [],
  editorDataVersion: 0,
  customNodeError: null,
};

const MAX_LIFECYCLE_LOG_LINES = 500;

// ============================================================================
// Helper Functions
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCustomNodeTemplate(value: unknown): value is CustomNodeTemplate {
  return isRecord(value) && typeof value.name === "string" && typeof value.kind === "string";
}

function parseCustomNodeTemplates(value: unknown): CustomNodeTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is CustomNodeTemplate => isCustomNodeTemplate(entry));
}

function isCustomIconInfo(value: unknown): value is CustomIconInfo {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.source === "workspace" || value.source === "global") &&
    typeof value.dataUri === "string" &&
    (value.format === "svg" || value.format === "png")
  );
}

function parseCustomIconInfos(value: unknown): CustomIconInfo[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is CustomIconInfo => isCustomIconInfo(entry));
}

/** Parse non-topology bootstrap data from extension/dev host */
export function parseInitialData(data: unknown): Partial<TopoViewerState> {
  if (!isRecord(data)) return {};
  const obj = data;
  const defaultNode = typeof obj.defaultNode === "string" ? obj.defaultNode : "";
  return {
    customNodes: parseCustomNodeTemplates(obj.customNodes),
    defaultNode,
    customIcons: parseCustomIconInfos(obj.customIcons),
  };
}

// ============================================================================
// Store Creation
// ============================================================================

export const useTopoViewerStore = createWithEqualityFn<TopoViewerStore>((set, get) => ({
  ...initialState,

  // Selection (mutually exclusive)
  selectNode: (nodeId) => {
    set({ selectedNode: nodeId, selectedEdge: null, editingImpairment: null });
  },

  selectEdge: (edgeId) => {
    set({ selectedEdge: edgeId, selectedNode: null, editingImpairment: null });
  },

  // Editing (mutually exclusive, clears selection)
  editNode: (nodeId) => {
    set({
      editingNode: nodeId,
      editingEdge: null,
      editingImpairment: null,
      editingNetwork: null,
      selectedNode: null,
      selectedEdge: null,
    });
  },

  editEdge: (edgeId) => {
    set({
      editingEdge: edgeId,
      editingNode: null,
      editingImpairment: null,
      editingNetwork: null,
      selectedNode: null,
      selectedEdge: null,
    });
  },

  editImpairment: (edgeId) => {
    set({
      editingImpairment: edgeId,
      editingNode: null,
      editingEdge: null,
      editingNetwork: null,
      selectedNode: null,
      selectedEdge: null,
    });
  },

  editNetwork: (nodeId) => {
    set({
      editingNetwork: nodeId,
      editingNode: null,
      editingEdge: null,
      editingImpairment: null,
      selectedNode: null,
      selectedEdge: null,
    });
  },

  // Mode and state — clear selection & editing so stale tabs disappear
  setMode: (mode) => {
    set({
      mode,
      selectedNode: null,
      selectedEdge: null,
      editingNode: null,
      editingEdge: null,
      editingNetwork: null,
      editingImpairment: null,
      editingCustomTemplate: null,
    });
    // Also clear annotation editing state (separate store)
    const annotationUI = useAnnotationUIStore.getState();
    if (annotationUI.editingTextAnnotation) annotationUI.setEditingTextAnnotation(null);
    if (annotationUI.editingShapeAnnotation) annotationUI.setEditingShapeAnnotation(null);
    if (annotationUI.editingTrafficRateAnnotation) annotationUI.closeTrafficRateEditor();
    if (annotationUI.editingGroup) annotationUI.closeGroupEditor();
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

  setGridColor: (color) => {
    set({ gridColor: color });
  },

  setGridBgColor: (color) => {
    set({ gridBgColor: color });
  },

  // Edge annotations
  setEdgeAnnotations: (edgeAnnotations) => {
    set({ edgeAnnotations });
  },

  upsertEdgeAnnotation: (annotation) => {
    set((state) => ({
      edgeAnnotations: upsertEdgeAnnotation(state.edgeAnnotations, annotation),
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
      selectedEdge: editingCustomTemplate ? null : state.selectedEdge,
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
    set((state) => {
      const next: Partial<TopoViewerState> = {
        isProcessing,
      };

      if (isProcessing) {
        next.processingMode = mode ?? null;
        next.lifecycleModalOpen = true;
        next.lifecycleStatus = "running";
        next.lifecycleStatusMessage = null;
        next.editingNode = null;
        next.editingEdge = null;
        next.editingImpairment = null;
        next.editingNetwork = null;
        next.editingCustomTemplate = null;
        next.selectedNode = null;
        next.selectedEdge = null;
        next.lifecycleLogs = [];
      } else if (mode) {
        next.processingMode = mode;
      }

      return { ...state, ...next };
    });
  },

  setLifecycleStatus: (lifecycleStatus, lifecycleStatusMessage = null) => {
    set({ lifecycleStatus, lifecycleStatusMessage });
  },

  appendLifecycleLog: (line, stream = "stdout") => {
    set((state) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return state;
      }

      const nextLogs = [...state.lifecycleLogs, { line: trimmedLine, stream }];
      if (nextLogs.length > MAX_LIFECYCLE_LOG_LINES) {
        nextLogs.splice(0, nextLogs.length - MAX_LIFECYCLE_LOG_LINES);
      }

      return { lifecycleLogs: nextLogs };
    });
  },

  clearLifecycleLogs: () => {
    set({ lifecycleLogs: [] });
  },

  closeLifecycleModal: () => {
    set({
      lifecycleModalOpen: false,
      lifecycleStatus: null,
      lifecycleStatusMessage: null,
      lifecycleLogs: [],
      processingMode: null,
    });
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
      editingNetwork: state.editingNetwork === nodeId ? null : state.editingNetwork,
    }));
  },

  clearSelectionForDeletedEdge: (edgeId) => {
    set((state) => ({
      selectedEdge: state.selectedEdge === edgeId ? null : state.selectedEdge,
      editingEdge: state.editingEdge === edgeId ? null : state.editingEdge,
      editingImpairment: state.editingImpairment === edgeId ? null : state.editingImpairment,
    }));
  },

  // Initial data — if mode changes, clear selection & editing so stale tabs disappear
  setInitialData: (data) => {
    if (data.mode && data.mode !== get().mode) {
      set({
        ...data,
        selectedNode: null,
        selectedEdge: null,
        editingNode: null,
        editingEdge: null,
        editingNetwork: null,
        editingImpairment: null,
        editingCustomTemplate: null,
      });
      const annotationUI = useAnnotationUIStore.getState();
      if (annotationUI.editingTextAnnotation) annotationUI.setEditingTextAnnotation(null);
      if (annotationUI.editingShapeAnnotation) annotationUI.setEditingShapeAnnotation(null);
      if (annotationUI.editingTrafficRateAnnotation) annotationUI.closeTrafficRateEditor();
      if (annotationUI.editingGroup) annotationUI.closeGroupEditor();
    } else {
      set(data);
    }
  },
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

/** Get editing impairment edge */
export const useEditingImpairment = () => useTopoViewerStore((state) => state.editingImpairment);

/** Get lock state */
export const useIsLocked = () =>
  useTopoViewerStore((state) => state.isLocked || state.isProcessing);

/** Get link label mode */
export const useLinkLabelMode = () => useTopoViewerStore((state) => state.linkLabelMode);

/** Get dummy link visibility */
export const useShowDummyLinks = () => useTopoViewerStore((state) => state.showDummyLinks);

/** Get endpoint label offset */
export const useEndpointLabelOffset = () =>
  useTopoViewerStore((state) => state.endpointLabelOffset);

export const useGridColor = () => useTopoViewerStore((state) => state.gridColor);
export const useGridBgColor = () => useTopoViewerStore((state) => state.gridBgColor);

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
      yamlFileName: state.yamlFileName,
      annotationsFileName: state.annotationsFileName,
      yamlContent: state.yamlContent,
      annotationsContent: state.annotationsContent,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      selectedNode: state.selectedNode,
      selectedEdge: state.selectedEdge,
      editingImpairment: state.editingImpairment,
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
      lifecycleModalOpen: state.lifecycleModalOpen,
      lifecycleStatus: state.lifecycleStatus,
      lifecycleStatusMessage: state.lifecycleStatusMessage,
      lifecycleLogs: state.lifecycleLogs,
      editorDataVersion: state.editorDataVersion,
      customNodeError: state.customNodeError,
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
      editImpairment: state.editImpairment,
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
      setLifecycleStatus: state.setLifecycleStatus,
      appendLifecycleLog: state.appendLifecycleLog,
      clearLifecycleLogs: state.clearLifecycleLogs,
      closeLifecycleModal: state.closeLifecycleModal,
      refreshEditorData: state.refreshEditorData,
      clearSelectionForDeletedNode: state.clearSelectionForDeletedNode,
      clearSelectionForDeletedEdge: state.clearSelectionForDeletedEdge,
      setInitialData: state.setInitialData,
    }),
    shallow
  );
