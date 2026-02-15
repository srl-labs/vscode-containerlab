// Palette view with editor and info tab content.
import React, { useCallback, useMemo, useRef } from "react";

import { PaletteSection } from "../../lab-drawer/PaletteSection";
import { NodeTemplateModal } from "../../node-editor/NodeTemplateModal";
import type { GroupEditorData } from "../../../../hooks/canvas";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../../../shared/types/topology";
import type { LinkEditorData } from "../../link-editor/types";
import type { LinkImpairmentData } from "../../link-impairment/types";
import type { NetworkEditorData } from "../../network-editor/types";
import type { NodeEditorData } from "../../node-editor/types";

import { EditorTabContent } from "./EditorTabContent";
import type { EditorFooterRef, EditorBannerRef } from "./EditorTabContent";
import { InfoTabContent } from "./InfoTabContent";
import { usePanelTabVisibility } from "../../../../hooks/ui/usePanelTabVisibility";
import type { NodeData, LinkData } from "../../../../hooks/ui";

type FooterRefLocal = EditorFooterRef | null;

export interface PaletteViewProps {
  mode?: "edit" | "view";
  isLocked?: boolean;
  requestedTab?: { tabId: string };
  onEditCustomNode: (name: string) => void;
  onDeleteCustomNode: (name: string) => void;
  onSetDefaultCustomNode: (name: string) => void;
  selectedNodeData?: NodeData | null;
  selectedLinkData?: (LinkData & { extraData?: Record<string, unknown> }) | null;
  editor?: {
    editingNodeData: NodeEditorData | null;
    editingNodeInheritedProps: string[];
    nodeEditorHandlers: {
      handleClose: () => void;
      handleSave: (data: NodeEditorData) => void;
      handleApply: (data: NodeEditorData) => void;
      handleDelete?: () => void;
    };
    editingLinkData: LinkEditorData | null;
    linkEditorHandlers: {
      handleClose: () => void;
      handleSave: (data: LinkEditorData) => void;
      handleApply: (data: LinkEditorData) => void;
      previewOffset: (data: LinkEditorData) => void;
      revertOffset: () => void;
      handleDelete?: () => void;
    };
    editingNetworkData: NetworkEditorData | null;
    networkEditorHandlers: {
      handleClose: () => void;
      handleSave: (data: NetworkEditorData) => void;
      handleApply: (data: NetworkEditorData) => void;
    };
    linkImpairmentData: LinkImpairmentData | null;
    linkImpairmentHandlers: {
      onError: (error: string) => void;
      onApply: (data: LinkImpairmentData) => void;
      onSave: (data: LinkImpairmentData) => void;
      onClose: () => void;
    };
    editingTextAnnotation: FreeTextAnnotation | null;
    textAnnotationHandlers: {
      onSave: (annotation: FreeTextAnnotation) => void;
      onClose: () => void;
      onDelete: (id: string) => void;
    };
    editingShapeAnnotation: FreeShapeAnnotation | null;
    shapeAnnotationHandlers: {
      onSave: (annotation: FreeShapeAnnotation) => void;
      onClose: () => void;
      onDelete: (id: string) => void;
    };
    editingGroup: GroupEditorData | null;
    groupHandlers: {
      onSave: (data: GroupEditorData) => void;
      onClose: () => void;
      onDelete: (groupId: string) => void;
      onStylePreview: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
    };
  };
  onFooterRef?: (ref: EditorFooterRef | null) => void;
  onBannerRef?: (ref: EditorBannerRef | null) => void;
}

const NOOP_BANNER = () => {};

export const PaletteView: React.FC<PaletteViewProps> = ({
  mode,
  isLocked,
  requestedTab,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode,
  selectedNodeData,
  selectedLinkData,
  editor,
  onFooterRef,
  onBannerRef
}) => {
  const localFooterRef = useRef<FooterRefLocal>(null);

  const wrappedOnFooterRef = useCallback(
    (ref: EditorFooterRef | null) => {
      localFooterRef.current = ref;
      onFooterRef?.(ref);
    },
    [onFooterRef]
  );

  const { showInfoTab, showEditTab, infoTabTitle, editTabTitle } = usePanelTabVisibility();

  const editDeleteHandler = useMemo(() => {
    if (!editor) return undefined;
    if (editor.editingNodeData && editor.nodeEditorHandlers.handleDelete) {
      const del = editor.nodeEditorHandlers.handleDelete;
      const close = editor.nodeEditorHandlers.handleClose;
      return () => {
        del();
        close();
      };
    }
    if (editor.editingLinkData && editor.linkEditorHandlers.handleDelete) {
      const del = editor.linkEditorHandlers.handleDelete;
      const close = editor.linkEditorHandlers.handleClose;
      return () => {
        del();
        close();
      };
    }
    if (editor.editingTextAnnotation) {
      const id = editor.editingTextAnnotation.id;
      return () => {
        editor.textAnnotationHandlers.onDelete(id);
        editor.textAnnotationHandlers.onClose();
      };
    }
    if (editor.editingShapeAnnotation) {
      const id = editor.editingShapeAnnotation.id;
      return () => {
        editor.shapeAnnotationHandlers.onDelete(id);
        editor.shapeAnnotationHandlers.onClose();
      };
    }
    if (editor.editingGroup) {
      const id = editor.editingGroup.id;
      return () => {
        editor.groupHandlers.onDelete(id);
        editor.groupHandlers.onClose();
      };
    }
    return undefined;
  }, [editor]);

  const handleEditTabLeave = useCallback(() => {
    localFooterRef.current?.handleDiscard();
    wrappedOnFooterRef(null);
  }, [wrappedOnFooterRef]);

  const infoTabContent = (
    <InfoTabContent
      selectedNodeData={selectedNodeData ?? null}
      selectedLinkData={selectedLinkData ?? null}
    />
  );

  const editTabContent = editor ? (
    <EditorTabContent
      editingNodeData={editor.editingNodeData}
      editingNodeInheritedProps={editor.editingNodeInheritedProps}
      nodeEditorHandlers={editor.nodeEditorHandlers}
      editingLinkData={editor.editingLinkData}
      linkEditorHandlers={editor.linkEditorHandlers}
      editingNetworkData={editor.editingNetworkData}
      networkEditorHandlers={editor.networkEditorHandlers}
      linkImpairmentData={editor.linkImpairmentData}
      linkImpairmentHandlers={editor.linkImpairmentHandlers}
      editingTextAnnotation={editor.editingTextAnnotation}
      textAnnotationHandlers={editor.textAnnotationHandlers}
      editingShapeAnnotation={editor.editingShapeAnnotation}
      shapeAnnotationHandlers={editor.shapeAnnotationHandlers}
      editingGroup={editor.editingGroup}
      groupHandlers={editor.groupHandlers}
      onFooterRef={wrappedOnFooterRef}
      onBannerRef={onBannerRef ?? NOOP_BANNER}
    />
  ) : null;

  return (
    <>
      <PaletteSection
        mode={mode}
        isLocked={isLocked}
        requestedTab={requestedTab}
        onEditCustomNode={onEditCustomNode}
        onDeleteCustomNode={onDeleteCustomNode}
        onSetDefaultCustomNode={onSetDefaultCustomNode}
        editTabContent={editTabContent}
        showEditTab={showEditTab}
        editTabTitle={editTabTitle}
        onEditDelete={editDeleteHandler}
        onEditTabLeave={handleEditTabLeave}
        infoTabContent={infoTabContent}
        showInfoTab={showInfoTab}
        infoTabTitle={infoTabTitle}
      />
      <NodeTemplateModal />
    </>
  );
};
