/**
 * ContextPanel - Context-sensitive left panel that replaces LabDrawer + floating panels
 *
 * Content changes based on selection/editing state:
 * - Default: Palette
 * - Node selected (view mode): Node info
 * - Node editing: Node editor with tabs
 * - Link selected (view mode): Link info
 * - Link editing: Link editor with tabs
 * - etc.
 */
import React, { useCallback, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { ArrowBack as ArrowBackIcon, ChevronRight as ChevronRightIcon, Close as CloseIcon, Lock as LockIcon } from "@mui/icons-material";
import { Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material";

import { useIsLocked } from "../../../stores/topoViewerStore";
import type { NodeData, LinkData } from "../../../hooks/ui";
import { useContextPanelContent } from "../../../hooks/ui/useContextPanelContent";
import type { NodeEditorData } from "../node-editor/types";
import type { LinkEditorData } from "../link-editor/types";
import type { NetworkEditorData } from "../network-editor/types";
import type { LinkImpairmentData } from "../link-impairment/types";
import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from "../../../../shared/types/topology";
import type { GroupEditorData } from "../../../hooks/canvas";

import {
  PaletteView,
  NodeInfoView,
  LinkInfoView,
  NodeEditorView,
  LinkEditorView,
  NetworkEditorView,
  LinkImpairmentView,
  FreeTextEditorView,
  FreeShapeEditorView,
  GroupEditorView
} from "./views";

const DRAWER_WIDTH = 400;

/** Generic footer ref shape - all editor views expose the same interface */
interface FooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

// ─── Palette props ───
export interface ContextPanelPaletteProps {
  mode?: "edit" | "view";
  onEditCustomNode: (name: string) => void;
  onDeleteCustomNode: (name: string) => void;
  onSetDefaultCustomNode: (name: string) => void;
}

// ─── View mode props ───
export interface ContextPanelViewProps {
  selectedNodeData: NodeData | null;
  selectedLinkData: (LinkData & { extraData?: Record<string, unknown> }) | null;
}

// ─── Editor props ───
export interface ContextPanelEditorProps {
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
    handleAutoApplyOffset?: (data: LinkEditorData) => void;
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
    onStyleChange: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
  };
}

export interface ContextPanelProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onBack: () => void;
  rfInstance: ReactFlowInstance | null;
  palette: ContextPanelPaletteProps;
  view: ContextPanelViewProps;
  editor: ContextPanelEditorProps;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  isOpen,
  onOpen,
  onClose,
  onBack,
  palette,
  view,
  editor
}) => {
  const panelView = useContextPanelContent();
  const isLocked = useIsLocked();
  const isReadOnly = isLocked && panelView.hasFooter;
  const footerRef = useRef<FooterRef | null>(null);
  const [, forceUpdate] = useState(0);

  const setFooterRef = useCallback((ref: FooterRef | null) => {
    footerRef.current = ref;
    forceUpdate((n) => n + 1);
  }, []);

  const showBackButton = panelView.kind !== "palette";

  const renderContent = (): React.ReactElement => {
    switch (panelView.kind) {
      case "palette":
        return <PaletteView {...palette} isLocked={isLocked} />;
      case "nodeInfo":
        return <NodeInfoView nodeData={view.selectedNodeData} />;
      case "linkInfo":
        return <LinkInfoView linkData={view.selectedLinkData} />;
      case "nodeEditor":
        return (
          <NodeEditorView
            nodeData={editor.editingNodeData}
            onSave={editor.nodeEditorHandlers.handleSave}
            onApply={editor.nodeEditorHandlers.handleApply}
            inheritedProps={editor.editingNodeInheritedProps}
            onFooterRef={setFooterRef}
          />
        );
      case "customTemplateEditor":
        return (
          <NodeEditorView
            nodeData={editor.customTemplateEditorData}
            onSave={editor.customTemplateHandlers.handleSave}
            onApply={editor.customTemplateHandlers.handleApply}
            onFooterRef={setFooterRef}
          />
        );
      case "linkEditor":
        return (
          <LinkEditorView
            linkData={editor.editingLinkData}
            onSave={editor.linkEditorHandlers.handleSave}
            onApply={editor.linkEditorHandlers.handleApply}
            onAutoApplyOffset={editor.linkEditorHandlers.handleAutoApplyOffset}
            onFooterRef={setFooterRef}
          />
        );
      case "networkEditor":
        return (
          <NetworkEditorView
            nodeData={editor.editingNetworkData}
            onSave={editor.networkEditorHandlers.handleSave}
            onApply={editor.networkEditorHandlers.handleApply}
            onFooterRef={setFooterRef}
          />
        );
      case "linkImpairment":
        return (
          <LinkImpairmentView
            linkData={editor.linkImpairmentData}
            onError={editor.linkImpairmentHandlers.onError}
            onSave={editor.linkImpairmentHandlers.onSave}
            onApply={editor.linkImpairmentHandlers.onApply}
            onClose={editor.linkImpairmentHandlers.onClose}
            onFooterRef={setFooterRef}
          />
        );
      case "freeTextEditor":
        return (
          <FreeTextEditorView
            annotation={editor.editingTextAnnotation}
            onSave={editor.textAnnotationHandlers.onSave}
            onClose={editor.textAnnotationHandlers.onClose}
            onDelete={editor.textAnnotationHandlers.onDelete}
            onFooterRef={setFooterRef}
          />
        );
      case "freeShapeEditor":
        return (
          <FreeShapeEditorView
            annotation={editor.editingShapeAnnotation}
            onSave={editor.shapeAnnotationHandlers.onSave}
            onClose={editor.shapeAnnotationHandlers.onClose}
            onDelete={editor.shapeAnnotationHandlers.onDelete}
            onFooterRef={setFooterRef}
          />
        );
      case "groupEditor":
        return (
          <GroupEditorView
            groupData={editor.editingGroup}
            onSave={editor.groupHandlers.onSave}
            onClose={editor.groupHandlers.onClose}
            onDelete={editor.groupHandlers.onDelete}
            onStyleChange={editor.groupHandlers.onStyleChange}
            onFooterRef={setFooterRef}
          />
        );
      default:
        return <PaletteView {...palette} isLocked={isLocked} />;
    }
  };

  const footer = footerRef.current;
  const showFooter = panelView.hasFooter && footer;

  return (
    <>
      {/* Toggle tab when panel is closed */}
      {!isOpen && (
        <Tooltip title="Open panel" placement="right">
          <Box
            onClick={onOpen}
            sx={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 48,
              cursor: "pointer",
              borderRadius: "0 4px 4px 0",
              border: 1,
              borderLeft: 0,
              borderColor: "divider",
              bgcolor: "var(--vscode-editor-background)",
              opacity: 0.8,
              "&:hover": { opacity: 1, bgcolor: "action.hover" }
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </Box>
        </Tooltip>
      )}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: DRAWER_WIDTH,
          zIndex: 10,
          bgcolor: "var(--vscode-editor-background)",
          borderRight: 1,
          borderColor: "divider",
          display: isOpen ? "flex" : "none",
          flexDirection: "column",
          boxShadow: 4
        }}
      >
          {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: "divider",
            minHeight: 40
          }}
        >
          {showBackButton && (
            <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
            {panelView.title}
          </Typography>
          <IconButton
            size="small"
            onClick={() => {
              onBack();
              onClose();
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Read-only indicator */}
        {isReadOnly && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 2,
              py: 0.5,
              bgcolor: "action.hover",
              borderBottom: 1,
              borderColor: "divider"
            }}
          >
            <LockIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              Read-only — unlock to edit
            </Typography>
          </Box>
        )}

        {/* Content */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto",
            ...(isReadOnly && { pointerEvents: "none", opacity: 0.7 })
          }}
        >
          {renderContent()}
        </Box>

        {/* Footer (for editor views, hidden when read-only) */}
        {showFooter && !isReadOnly && (
          <>
            <Divider />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, p: 1.5 }}>
              <Button
                variant={footer.hasChanges ? "contained" : "outlined"}
                size="small"
                onClick={footer.handleApply}
              >
                Apply
              </Button>
              <Button variant="contained" size="small" onClick={footer.handleSave}>
                OK
              </Button>
            </Box>
          </>
        )}
      </Box>
    </>
  );
};
