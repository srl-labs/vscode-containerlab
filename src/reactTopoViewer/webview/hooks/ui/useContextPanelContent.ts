/**
 * useContextPanelContent - Determines what the ContextPanel should display
 * based on selection/editing state from stores.
 *
 * Priority: editing states > selection states > palette (default)
 */
import { useTopoViewerState } from "../../stores";
import type { TopoViewerState } from "../../stores/topoViewerStore";
import { useAnnotationUIStore } from "../../stores/annotationUIStore";
import type { AnnotationUIState } from "../../stores/annotationUIStore";

export type PanelViewKind =
  | "palette"
  | "nodeInfo"
  | "linkInfo"
  | "nodeEditor"
  | "linkEditor"
  | "networkEditor"
  | "linkImpairment"
  | "freeTextEditor"
  | "freeShapeEditor"
  | "trafficRateEditor"
  | "groupEditor";

export interface PanelView {
  kind: PanelViewKind;
  title: string;
  /** Whether the view has editor footer (Apply button) */
  hasFooter: boolean;
}

const PALETTE_VIEW: PanelView = { kind: "palette", title: "Palette", hasFooter: false };

function hasId(value: string | null): value is string {
  return value !== null && value.length > 0;
}

function resolveEditingView(
  state: Pick<
    TopoViewerState,
    "editingNode" | "editingEdge" | "editingNetwork" | "editingImpairment"
  >
): PanelView | null {
  if (hasId(state.editingNode))
    return { kind: "nodeEditor", title: "Node Editor", hasFooter: true };
  if (hasId(state.editingEdge))
    return { kind: "linkEditor", title: "Link Editor", hasFooter: true };
  if (hasId(state.editingNetwork))
    return { kind: "networkEditor", title: "Network Editor", hasFooter: true };
  if (hasId(state.editingImpairment))
    return { kind: "linkImpairment", title: "Link Impairments", hasFooter: true };
  return null;
}

function resolveAnnotationView(annotationUI: AnnotationUIState): PanelView | null {
  if (annotationUI.editingTextAnnotation) {
    const isNew = annotationUI.editingTextAnnotation.text === "";
    return { kind: "freeTextEditor", title: isNew ? "Add Text" : "Edit Text", hasFooter: true };
  }
  if (annotationUI.editingShapeAnnotation) {
    const shapeType = annotationUI.editingShapeAnnotation.shapeType;
    const prefix = shapeType.charAt(0).toUpperCase() + shapeType.slice(1);
    return { kind: "freeShapeEditor", title: `Edit ${prefix}`, hasFooter: true };
  }
  if (annotationUI.editingTrafficRateAnnotation) {
    return { kind: "trafficRateEditor", title: "Edit Traffic Rate", hasFooter: true };
  }
  if (annotationUI.editingGroup)
    return { kind: "groupEditor", title: "Edit Group", hasFooter: true };
  return null;
}

function resolveSelectionView(
  state: Pick<TopoViewerState, "selectedNode" | "selectedEdge" | "mode">
): PanelView | null {
  if (hasId(state.selectedNode) && state.mode === "view")
    return { kind: "nodeInfo", title: "Node Properties", hasFooter: false };
  if (hasId(state.selectedEdge) && state.mode === "view")
    return { kind: "linkInfo", title: "Link Properties", hasFooter: false };
  return null;
}

export function useContextPanelContent(): PanelView {
  const state = useTopoViewerState();
  const annotationUI = useAnnotationUIStore();

  return (
    resolveEditingView(state) ??
    resolveAnnotationView(annotationUI) ??
    resolveSelectionView(state) ??
    PALETTE_VIEW
  );
}
