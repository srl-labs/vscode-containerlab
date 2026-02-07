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
  | "groupEditor"
  | "customTemplateEditor";

export interface PanelView {
  kind: PanelViewKind;
  title: string;
  /** Whether the view has editor footer (Apply/OK buttons) */
  hasFooter: boolean;
}

const PALETTE_VIEW: PanelView = { kind: "palette", title: "Palette", hasFooter: false };

function resolveEditingView(state: TopoViewerState): PanelView | null {
  if (state.editingCustomTemplate) {
    const isNew = state.editingCustomTemplate.id !== "edit-custom-node";
    return { kind: "customTemplateEditor", title: isNew ? "Create Custom Node" : "Edit Custom Node", hasFooter: true };
  }
  if (state.editingNode) return { kind: "nodeEditor", title: "Node Editor", hasFooter: true };
  if (state.editingEdge) return { kind: "linkEditor", title: "Link Editor", hasFooter: true };
  if (state.editingNetwork) return { kind: "networkEditor", title: "Network Editor", hasFooter: true };
  if (state.editingImpairment) return { kind: "linkImpairment", title: "Link Impairments", hasFooter: true };
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
  if (annotationUI.editingGroup) return { kind: "groupEditor", title: "Edit Group", hasFooter: true };
  return null;
}

function resolveSelectionView(state: TopoViewerState): PanelView | null {
  if (state.selectedNode && state.mode === "view") return { kind: "nodeInfo", title: "Node Properties", hasFooter: false };
  if (state.selectedEdge && state.mode === "view") return { kind: "linkInfo", title: "Link Properties", hasFooter: false };
  return null;
}

export function useContextPanelContent(): PanelView {
  const state = useTopoViewerState();
  const annotationUI = useAnnotationUIStore();

  return resolveEditingView(state)
    ?? resolveAnnotationView(annotationUI)
    ?? resolveSelectionView(state)
    ?? PALETTE_VIEW;
}
