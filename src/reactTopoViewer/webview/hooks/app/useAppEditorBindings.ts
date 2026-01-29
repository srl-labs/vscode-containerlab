/**
 * useAppEditorBindings - editor handler wiring for AppContent.
 */
import React from "react";

import type { LinkEditorData } from "../../../shared/types/editors";
import type { TopoViewerActions, TopoViewerState } from "../../stores/topoViewerStore";
import {
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  useCustomTemplateEditor
} from "../editor";

import type { useSelectionData } from "./useAppContentHelpers";

interface AppEditorBindingsParams {
  state: Pick<TopoViewerState, "edgeAnnotations" | "editingCustomTemplate">;
  actions: Pick<
    TopoViewerActions,
    | "editNode"
    | "editEdge"
    | "editNetwork"
    | "editCustomTemplate"
    | "setEdgeAnnotations"
    | "refreshEditorData"
  >;
  selectionData: ReturnType<typeof useSelectionData>;
  renameNodeInGraph: (oldId: string, newId: string, name?: string) => void;
  handleUpdateNodeData: (nodeId: string, extraData: Record<string, unknown>) => void;
  handleUpdateEdgeData: (edgeId: string, data: LinkEditorData) => void;
}

export function useAppEditorBindings({
  state,
  actions,
  selectionData,
  renameNodeInGraph,
  handleUpdateNodeData,
  handleUpdateEdgeData
}: AppEditorBindingsParams) {
  const {
    editNode,
    editEdge,
    editNetwork,
    editCustomTemplate,
    setEdgeAnnotations,
    refreshEditorData
  } = actions;

  const nodeEditorHandlers = useNodeEditorHandlers(
    editNode,
    selectionData.editingNodeData,
    renameNodeInGraph,
    handleUpdateNodeData,
    refreshEditorData
  );

  const linkEditorHandlers = useLinkEditorHandlers(
    editEdge,
    selectionData.editingLinkData,
    {
      edgeAnnotations: state.edgeAnnotations,
      setEdgeAnnotations
    },
    handleUpdateEdgeData
  );

  const networkEditorHandlers = useNetworkEditorHandlers(
    editNetwork,
    selectionData.editingNetworkData,
    renameNodeInGraph
  );

  const { editorData: customTemplateEditorData, handlers: customTemplateHandlers } =
    useCustomTemplateEditor(state.editingCustomTemplate, editCustomTemplate);

  return {
    nodeEditorHandlers,
    linkEditorHandlers,
    networkEditorHandlers,
    customTemplateEditorData,
    customTemplateHandlers
  };
}
