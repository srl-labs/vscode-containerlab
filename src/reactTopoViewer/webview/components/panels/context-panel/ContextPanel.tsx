// Context-sensitive panel with palette, info, and editor tabs.
import React, { useCallback, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  EditOutlined as EditOutlinedIcon,
  ErrorOutline as ErrorOutlineIcon,
  Lock as LockIcon,
  SwapHoriz as SwapHorizIcon
} from "@mui/icons-material";
import { Box, Button, Divider, Drawer, Tooltip, Typography } from "@mui/material";

import { useIsLocked } from "../../../stores/topoViewerStore";
import type { NodeData, LinkData } from "../../../hooks/ui";
import { useContextPanelContent } from "../../../hooks/ui/useContextPanelContent";
import type { NodeEditorData } from "../node-editor/types";
import type { LinkEditorData } from "../link-editor/types";
import type { NetworkEditorData } from "../network-editor/types";
import type { LinkImpairmentData } from "../link-impairment/types";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../../shared/types/topology";
import type { GroupEditorData } from "../../../hooks/canvas";

import { PaletteView } from "./views";

const MIN_WIDTH = 500;
function getMaxWidth() {
  return Math.floor(window.innerWidth / 2);
}
const TEXT_SECONDARY = "text.secondary";
const ACTION_HOVER = "action.hover";

interface BannerRef {
  errors: string[];
}

interface FooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

export interface ContextPanelPaletteProps {
  mode?: "edit" | "view";
  requestedTab?: { tabId: string };
  onEditCustomNode: (name: string) => void;
  onDeleteCustomNode: (name: string) => void;
  onSetDefaultCustomNode: (name: string) => void;
}

export interface ContextPanelViewProps {
  selectedNodeData: NodeData | null;
  selectedLinkData: (LinkData & { extraData?: Record<string, unknown> }) | null;
}

export interface ContextPanelEditorProps {
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
}

function renderContextPanelContent(
  palette: ContextPanelPaletteProps,
  view: ContextPanelViewProps,
  editor: ContextPanelEditorProps,
  isLocked: boolean,
  setFooterRef: (ref: FooterRef | null) => void,
  setBannerRef: (ref: BannerRef | null) => void
): React.ReactElement {
  return (
    <PaletteView
      {...palette}
      isLocked={isLocked}
      selectedNodeData={view.selectedNodeData}
      selectedLinkData={view.selectedLinkData}
      editor={editor}
      onFooterRef={setFooterRef}
      onBannerRef={setBannerRef}
    />
  );
}

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
    bgcolor: "background.paper",
    "&:hover": { bgcolor: ACTION_HOVER }
  };

  return (
    <Box
      sx={{
        position: "absolute",
        [isLeft ? "left" : "right"]: isOpen ? panelWidth : 0,
        top: "50%",
        transform: "translateY(-50%)",
        transition: isDragging
          ? "none"
          : (theme) =>
              theme.transitions.create(positionProp, {
                duration: theme.transitions.duration.short
              }),
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5
      }}
    >
      <Tooltip title={isOpen ? "Close panel" : "Open panel"} placement={tooltipPlacement}>
        <Box
          onClick={
            isOpen
              ? () => {
                  onBack();
                  onClose();
                }
              : onOpen
          }
          data-testid="panel-toggle-btn"
          sx={{ ...handleStyle, height: 48 }}
        >
          {isOpen ? (
            <CloseChevron sx={{ fontSize: 16, color: TEXT_SECONDARY }} />
          ) : (
            <OpenIcon sx={{ fontSize: 16, color: TEXT_SECONDARY }} />
          )}
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

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const newWidth = sideRef.current === "left" ? ev.clientX : window.innerWidth - ev.clientX;
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
    },
    [sideRef]
  );

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
  const bannerRef = useRef<BannerRef | null>(null);
  const [, forceUpdate] = useState(0);
  const isLeft = side === "left";
  const sideRef = useRef(side);
  sideRef.current = side;
  const { panelWidth, isDragging, handleResizeStart } = usePanelResize(sideRef);

  const setFooterRef = useCallback((ref: FooterRef | null) => {
    footerRef.current = ref;
    forceUpdate((n) => n + 1);
  }, []);

  const setBannerRef = useCallback((ref: BannerRef | null) => {
    bannerRef.current = ref;
    forceUpdate((n) => n + 1);
  }, []);

  const sideLayout = isLeft
    ? { border: "borderRight", resize: "right" }
    : { border: "borderLeft", resize: "left" };

  const content = renderContextPanelContent(
    palette,
    view,
    editor,
    isLocked,
    setFooterRef,
    setBannerRef
  );

  const footer = footerRef.current;
  const showFooter = panelView.hasFooter && footer;

  return (
    <>
      <ToggleHandle
        isOpen={isOpen}
        panelWidth={panelWidth}
        isDragging={isDragging}
        side={side}
        onOpen={onOpen}
        onClose={onClose}
        onBack={onBack}
        onToggleSide={onToggleSide}
      />
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
            pointerEvents: "auto"
          }
        }}
      >
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
                bgcolor: "error.main",
                color: "error.contrastText"
              }}
            >
              <LockIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">Read-only — unlock lab to edit</Typography>
            </Box>
            <Divider />
          </>
        )}

        {bannerRef.current &&
          bannerRef.current.errors.map((err, i) => (
            <React.Fragment key={i}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 2,
                  py: 0.5,
                  bgcolor: ACTION_HOVER,
                  color: "error.main"
                }}
              >
                <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">{err}</Typography>
              </Box>
              <Divider />
            </React.Fragment>
          ))}

        {panelView.hasFooter && footer?.hasChanges && !isReadOnly && (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 2,
                py: 0.5,
                bgcolor: ACTION_HOVER
              }}
            >
              <EditOutlinedIcon sx={{ fontSize: 14, color: TEXT_SECONDARY }} />
              <Typography variant="caption" color="text.secondary">
                Unsaved changes — click Apply to save
              </Typography>
            </Box>
            <Divider />
          </>
        )}

        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto"
          }}
        >
          {content}
        </Box>

        {showFooter && !isReadOnly && (
          <>
            <Divider />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, p: 1.5 }}>
              <Button
                size="small"
                onClick={footer.handleApply}
                data-testid="panel-apply-btn"
              >
                Apply
              </Button>
            </Box>
          </>
        )}

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
