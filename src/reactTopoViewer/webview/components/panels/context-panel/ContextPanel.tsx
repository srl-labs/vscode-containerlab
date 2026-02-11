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
import { ArrowBack as ArrowBackIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Close as CloseIcon, Lock as LockIcon, SwapHoriz as SwapHorizIcon } from "@mui/icons-material";
import { Box, Button, Divider, Drawer, IconButton, Tooltip, Typography } from "@mui/material";


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

const MIN_WIDTH = 400;
function getMaxWidth() {
  return Math.floor(window.innerWidth / 2);
}
const TEXT_SECONDARY = "text.secondary";

/** Generic footer ref shape - all editor views expose the same interface */
interface FooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

// ─── Palette props ───
export interface ContextPanelPaletteProps {
  mode?: "edit" | "view";
  requestedTab?: { tab: number };
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

function renderContextPanelContent(
  kind: string,
  palette: ContextPanelPaletteProps,
  view: ContextPanelViewProps,
  editor: ContextPanelEditorProps,
  isLocked: boolean,
  isReadOnly: boolean,
  setFooterRef: (ref: FooterRef | null) => void
): React.ReactElement {
  switch (kind) {
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
          readOnly={isReadOnly}
        />
      );
    case "customTemplateEditor":
      return (
        <NodeEditorView
          nodeData={editor.customTemplateEditorData}
          onSave={editor.customTemplateHandlers.handleSave}
          onApply={editor.customTemplateHandlers.handleApply}
          onFooterRef={setFooterRef}
          readOnly={isReadOnly}
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
          readOnly={isReadOnly}
        />
      );
    case "networkEditor":
      return (
        <NetworkEditorView
          nodeData={editor.editingNetworkData}
          onSave={editor.networkEditorHandlers.handleSave}
          onApply={editor.networkEditorHandlers.handleApply}
          onFooterRef={setFooterRef}
          readOnly={isReadOnly}
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
          readOnly={isReadOnly}
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
          readOnly={isReadOnly}
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
          readOnly={isReadOnly}
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
          readOnly={isReadOnly}
        />
      );
    default:
      return <PaletteView {...palette} isLocked={isLocked} />;
  }
}

/** Toggle handle shown on the side of the panel — extracted to reduce component complexity. */
const ToggleHandle: React.FC<{
  isOpen: boolean;
  panelWidth: number;
  isDragging: boolean;
  side: "left" | "right";
  onOpen: () => void;
  onClose: () => void;
  onBack: () => void;
  onToggleSide: () => void;
}> = ({ isOpen, panelWidth, isDragging, onOpen, onClose, onBack, side, onToggleSide }) => {
  const isLeft = side === "left";
  const tooltipPlacement = isLeft ? "right" : "left";
  const positionProp = isLeft ? "left" : "right";
  const transitionProp = `${positionProp} 0.25s ease`;
  const OpenIcon = isLeft ? ChevronRightIcon : ChevronLeftIcon;
  const CloseChevron = isLeft ? ChevronLeftIcon : ChevronRightIcon;

  const handleStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    cursor: "pointer",
    borderRadius: isLeft ? "0 4px 4px 0" : "4px 0 0 4px",
    border: 1,
    [isLeft ? "borderLeft" : "borderRight"]: 0,
    borderColor: "divider",
    opacity: 0.8,
    "&:hover": { opacity: 1, bgcolor: "action.hover" }
  };

  return (
    <Box
      sx={{
        position: "absolute",
        [isLeft ? "left" : "right"]: isOpen ? panelWidth : 0,
        top: "50%",
        transform: "translateY(-50%)",
        transition: isDragging ? "none" : transitionProp,
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <Tooltip title={isOpen ? "Close panel" : "Open panel"} placement={tooltipPlacement}>
        <Box
          onClick={isOpen ? () => { onBack(); onClose(); } : onOpen}
          data-testid="panel-toggle-btn"
          sx={{ ...handleStyle, height: 48 }}
        >
          {isOpen
            ? <CloseChevron sx={{ fontSize: 16, color: TEXT_SECONDARY }} />
            : <OpenIcon sx={{ fontSize: 16, color: TEXT_SECONDARY }} />
          }
        </Box>
      </Tooltip>
      {isOpen && (
        <Tooltip title={`Move panel to ${isLeft ? "right" : "left"}`} placement={tooltipPlacement}>
          <Box onClick={onToggleSide} sx={{ ...handleStyle, height: 24 }}>
            <SwapHorizIcon sx={{ fontSize: 14, color: TEXT_SECONDARY }} />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
};

function usePanelResize(sideRef: React.RefObject<string>) {
  const [panelWidth, setPanelWidth] = useState(MIN_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newWidth = sideRef.current === "left"
        ? ev.clientX
        : window.innerWidth - ev.clientX;
      setPanelWidth(Math.min(getMaxWidth(), Math.max(MIN_WIDTH, newWidth)));
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sideRef]);

  return { panelWidth, isDragging, handleResizeStart };
}

export interface ContextPanelProps {
  isOpen: boolean;
  side: "left" | "right";
  onOpen: () => void;
  onClose: () => void;
  onBack: () => void;
  onToggleSide: () => void;
  rfInstance: ReactFlowInstance | null;
  palette: ContextPanelPaletteProps;
  view: ContextPanelViewProps;
  editor: ContextPanelEditorProps;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  isOpen,
  side,
  onOpen,
  onClose,
  onBack,
  onToggleSide,
  palette,
  view,
  editor
}) => {
  const panelView = useContextPanelContent();
  const isLocked = useIsLocked();
  const isReadOnly = isLocked && panelView.hasFooter;
  const footerRef = useRef<FooterRef | null>(null);
  const [, forceUpdate] = useState(0);
  const isLeft = side === "left";
  const sideRef = useRef(side);
  sideRef.current = side;
  const { panelWidth, isDragging, handleResizeStart } = usePanelResize(sideRef);

  const setFooterRef = useCallback((ref: FooterRef | null) => {
    footerRef.current = ref;
    forceUpdate((n) => n + 1);
  }, []);

  const sideLayout = isLeft
    ? { border: "borderRight", resize: "right" }
    : { border: "borderLeft", resize: "left" };

  const showBackButton = panelView.kind !== "palette";

  const content = renderContextPanelContent(panelView.kind, palette, view, editor, isLocked, isReadOnly, setFooterRef);

  const footer = footerRef.current;
  const showFooter = panelView.hasFooter && footer;

  return (
    <>
      <ToggleHandle isOpen={isOpen} panelWidth={panelWidth} isDragging={isDragging} side={side} onOpen={onOpen} onClose={onClose} onBack={onBack} onToggleSide={onToggleSide} />
      <Drawer
        variant="persistent"
        anchor={side}
        open={isOpen}
        transitionDuration={250}
        data-testid="context-panel"
        sx={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          pointerEvents: "none",
          "& .MuiDrawer-paper": {
            position: "absolute",
            width: panelWidth,
            boxShadow: 4,
            [sideLayout.border]: 1,
            borderColor: "divider",
            pointerEvents: "auto",
          }
        }}
      >
          {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1,
            py: 0.5,
            minHeight: 40
          }}
        >
          {showBackButton ? (
            <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }} data-testid="panel-back-btn">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          ) : (
            <IconButton size="small" onClick={() => { onBack(); onClose(); }} sx={{ mr: 0.5 }} data-testid="panel-close-btn">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }} data-testid="panel-title">
            {panelView.title}
          </Typography>
        </Box>
        <Divider />

        {/* Read-only indicator */}
        {isLocked && (
          <>
            <Box
              data-testid="panel-readonly-indicator"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 2,
                py: 0.5,
                bgcolor: "action.hover",
              }}
            >
              <LockIcon sx={{ fontSize: 14, color: TEXT_SECONDARY }} />
              <Typography variant="caption" color="text.secondary">
                Read-only — unlock lab to edit
              </Typography>
            </Box>
            <Divider />
          </>
        )}

        {/* Content */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto"
          }}
        >
          {content}
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
                data-testid="panel-apply-btn"
              >
                Apply
              </Button>
            </Box>
          </>
        )}

        {/* Resize handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            position: "absolute",
            [sideLayout.resize]: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            zIndex: 1,
            "&:hover": { bgcolor: "primary.main", opacity: 0.3 }
          }}
        />
      </Drawer>
    </>
  );
};
