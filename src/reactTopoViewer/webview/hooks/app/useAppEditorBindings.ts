/**
 * useAppEditorBindings - editor handler wiring for AppContent.
 */
import type { LinkEditorData } from "../../../shared/types/editors";
import type { TopoViewerActions, TopoViewerState } from "../../stores/topoViewerStore";
import { useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers } from "../editor";

import type { useSelectionData } from "./useAppContentHelpers";

interface AppEditorBindingsParams {
  state: Pick<TopoViewerState, "edgeAnnotations">;
  actions: Pick<
    TopoViewerActions,
    "editNode" | "editEdge" | "editNetwork" | "setEdgeAnnotations" | "refreshEditorData"
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
  handleUpdateEdgeData,
}: AppEditorBindingsParams) {
  const { editNode, editEdge, editNetwork, setEdgeAnnotations, refreshEditorData } = actions;

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
      setEdgeAnnotations,
    },
    handleUpdateEdgeData
  );

  const networkEditorHandlers = useNetworkEditorHandlers(
    editNetwork,
    selectionData.editingNetworkData,
    renameNodeInGraph
  );

  return {
    nodeEditorHandlers,
    linkEditorHandlers,
    networkEditorHandlers,
  };
}
