// Editor content for the Edit tab.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import { useContextPanelContent } from "../../../../hooks/ui/useContextPanelContent";
import { useIsLocked } from "../../../../stores/topoViewerStore";
import type { NodeEditorData } from "../../node-editor/types";
import type { LinkEditorData } from "../../link-editor/types";
import type { NetworkEditorData } from "../../network-editor/types";
import type { LinkImpairmentData } from "../../link-impairment/types";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../../../shared/types/topology";
import type { GroupEditorData } from "../../../../hooks/canvas";

import { NodeEditorView } from "./NodeEditorView";
import { LinkEditorView } from "./LinkEditorView";
import { NetworkEditorView } from "./NetworkEditorView";
import { LinkImpairmentView } from "./LinkImpairmentView";
import { FreeTextEditorView } from "./FreeTextEditorView";
import { FreeShapeEditorView } from "./FreeShapeEditorView";
import { GroupEditorView } from "./GroupEditorView";

/** Footer ref for editor apply/save actions */
export interface EditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

/** Banner ref for validation errors */
export interface EditorBannerRef {
  errors: string[];
}

export interface EditorTabContentProps {
  // Node editor
  editingNodeData: NodeEditorData | null;
  editingNodeInheritedProps: string[];
  nodeEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: NodeEditorData) => void;
    handleApply: (data: NodeEditorData) => void;
  };
  // Link editor
  editingLinkData: LinkEditorData | null;
  linkEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: LinkEditorData) => void;
    handleApply: (data: LinkEditorData) => void;
    previewOffset: (data: LinkEditorData) => void;
    revertOffset: () => void;
  };
  // Network editor
  editingNetworkData: NetworkEditorData | null;
  networkEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: NetworkEditorData) => void;
    handleApply: (data: NetworkEditorData) => void;
  };
  // Custom template editor
  customTemplateEditorData: NodeEditorData | null;
  customTemplateHandlers: {
    handleClose: () => void;
    handleSave: (data: NodeEditorData) => void;
    handleApply: (data: NodeEditorData) => void;
  };
  // Link impairment
  linkImpairmentData: LinkImpairmentData | null;
  linkImpairmentHandlers: {
    onError: (error: string) => void;
    onApply: (data: LinkImpairmentData) => void;
    onSave: (data: LinkImpairmentData) => void;
    onClose: () => void;
  };
  // Annotations
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
  // Refs
  onFooterRef: (ref: EditorFooterRef | null) => void;
  onBannerRef: (ref: EditorBannerRef | null) => void;
}

/** Placeholder shown when no editor is active */
const EditorPlaceholder: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 2,
      color: "text.secondary",
      p: 4
    }}
  >
    <EditOutlinedIcon sx={{ fontSize: 48, opacity: 0.5 }} />
    <Typography variant="body2" textAlign="center">
      Select a node, link, or annotation and click edit to modify it here.
    </Typography>
  </Box>
);

export const EditorTabContent: React.FC<EditorTabContentProps> = ({
  editingNodeData,
  editingNodeInheritedProps,
  nodeEditorHandlers,
  editingLinkData,
  linkEditorHandlers,
  editingNetworkData,
  networkEditorHandlers,
  customTemplateEditorData,
  customTemplateHandlers,
  linkImpairmentData,
  linkImpairmentHandlers,
  editingTextAnnotation,
  textAnnotationHandlers,
  editingShapeAnnotation,
  shapeAnnotationHandlers,
  editingGroup,
  groupHandlers,
  onFooterRef,
  onBannerRef
}) => {
  const panelView = useContextPanelContent();
  const isLocked = useIsLocked();
  const isReadOnly = isLocked && panelView.hasFooter;

  // Render the appropriate editor based on current state
  switch (panelView.kind) {
    case "nodeEditor":
      return (
        <NodeEditorView
          nodeData={editingNodeData}
          onSave={nodeEditorHandlers.handleSave}
          onApply={nodeEditorHandlers.handleApply}
          inheritedProps={editingNodeInheritedProps}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "customTemplateEditor":
      return (
        <NodeEditorView
          nodeData={customTemplateEditorData}
          onSave={customTemplateHandlers.handleSave}
          onApply={customTemplateHandlers.handleApply}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "linkEditor":
      return (
        <LinkEditorView
          linkData={editingLinkData}
          onSave={linkEditorHandlers.handleSave}
          onApply={linkEditorHandlers.handleApply}
          previewOffset={linkEditorHandlers.previewOffset}
          revertOffset={linkEditorHandlers.revertOffset}
          onFooterRef={onFooterRef}
          onBannerRef={onBannerRef}
          readOnly={isReadOnly}
        />
      );
    case "networkEditor":
      return (
        <NetworkEditorView
          nodeData={editingNetworkData}
          onSave={networkEditorHandlers.handleSave}
          onApply={networkEditorHandlers.handleApply}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "linkImpairment":
      return (
        <LinkImpairmentView
          linkData={linkImpairmentData}
          onError={linkImpairmentHandlers.onError}
          onSave={linkImpairmentHandlers.onSave}
          onApply={linkImpairmentHandlers.onApply}
          onClose={linkImpairmentHandlers.onClose}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "freeTextEditor":
      return (
        <FreeTextEditorView
          annotation={editingTextAnnotation}
          onSave={textAnnotationHandlers.onSave}
          onClose={textAnnotationHandlers.onClose}
          onDelete={textAnnotationHandlers.onDelete}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "freeShapeEditor":
      return (
        <FreeShapeEditorView
          annotation={editingShapeAnnotation}
          onSave={shapeAnnotationHandlers.onSave}
          onClose={shapeAnnotationHandlers.onClose}
          onDelete={shapeAnnotationHandlers.onDelete}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    case "groupEditor":
      return (
        <GroupEditorView
          groupData={editingGroup}
          onSave={groupHandlers.onSave}
          onClose={groupHandlers.onClose}
          onDelete={groupHandlers.onDelete}
          onStylePreview={groupHandlers.onStylePreview}
          onFooterRef={onFooterRef}
          readOnly={isReadOnly}
        />
      );
    default:
      return <EditorPlaceholder />;
  }
};
