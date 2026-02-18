import { FreeShapeEditorView } from "./FreeShapeEditorView";
import { FreeTextEditorView } from "./FreeTextEditorView";
import { GroupEditorView } from "./GroupEditorView";
import { LinkEditorView } from "./LinkEditorView";
import { LinkImpairmentView } from "./LinkImpairmentView";
import { NetworkEditorView } from "./NetworkEditorView";
import { NodeEditorView } from "./NodeEditorView";
import { TrafficRateEditorView } from "./TrafficRateEditorView";

export const editorViews = {
  FreeShapeEditorView,
  FreeTextEditorView,
  GroupEditorView,
  LinkEditorView,
  LinkImpairmentView,
  NetworkEditorView,
  NodeEditorView,
  TrafficRateEditorView
} as const;
