/**
 * usePanelTabVisibility - Centralizes mode-based tab visibility rules
 *
 * Hard rules:
 * - Info tab: ONLY visible in view mode, when a node or link is selected
 * - Edit tab: ONLY visible in edit mode, when an editor is active
 *
 * This prevents:
 * - Info tab from appearing in edit mode
 * - Edit tab from appearing in view mode
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
  const hasEditor = !!(
    state.editingNode ||
    state.editingEdge ||
    state.editingNetwork ||
    state.editingImpairment ||
    annotationUI.editingTextAnnotation ||
    annotationUI.editingShapeAnnotation ||
    annotationUI.editingGroup
  );
  const showEditTab = hasEditor;

  const editTabTitle = showEditTab ? panelView.title : undefined;

  return { showInfoTab, showEditTab, infoTabTitle, editTabTitle };
}
