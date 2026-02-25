/**
 * usePanelTabVisibility - Centralizes mode-based tab visibility rules.
 *
 * Rules:
 * - Info tab: visible in view mode for selected node/link.
 * - Edit tab: visible when an editor is active in any mode.
 * - Extra view-mode behavior: for unlocked selected nodes, also show Edit tab
 *   so icon/label/direction can be adjusted while running.
 */
import { useTopoViewerState } from "../../stores";
import { useAnnotationUIStore } from "../../stores/annotationUIStore";

import { useContextPanelContent } from "./useContextPanelContent";

export interface PanelTabVisibility {
  showInfoTab: boolean;
  showEditTab: boolean;
  infoTabTitle?: string;
  editTabTitle?: string;
}

export function usePanelTabVisibility(): PanelTabVisibility {
  const state = useTopoViewerState();
  const panelView = useContextPanelContent();
  const annotationUI = useAnnotationUIStore();

  const isViewMode = state.mode === "view";

  // Info tab: ONLY in view mode, when node or link is selected
  const showInfoTab =
    isViewMode && (panelView.kind === "nodeInfo" || panelView.kind === "linkInfo");
  let infoTabTitle: string | undefined;
  if (panelView.kind === "nodeInfo") {
    infoTabTitle = "Node Properties";
  } else if (panelView.kind === "linkInfo") {
    infoTabTitle = "Link Properties";
  }

  // Edit tab: visible whenever an editor is active (any mode).
  // Some editors are view-mode features (Link Impairments, annotation editing).
  const hasEditor = [
    state.editingNode,
    state.editingEdge,
    state.editingNetwork,
    state.editingImpairment,
    annotationUI.editingTextAnnotation,
    annotationUI.editingShapeAnnotation,
    annotationUI.editingTrafficRateAnnotation,
    annotationUI.editingGroup
  ].some((value) => value !== null);

  // In unlocked view mode, selected topology nodes can open a visual-only editor tab.
  const canEditSelectedNodeInViewMode =
    isViewMode &&
    state.isLocked === false &&
    panelView.kind === "nodeInfo" &&
    state.selectedNode !== null;
  const showEditTab = hasEditor || canEditSelectedNodeInViewMode;

  let editTabTitle: string | undefined;
  if (hasEditor) {
    editTabTitle = panelView.title;
  } else if (canEditSelectedNodeInViewMode) {
    editTabTitle = "Node Editor";
  }

  return { showInfoTab, showEditTab, infoTabTitle, editTabTitle };
}
