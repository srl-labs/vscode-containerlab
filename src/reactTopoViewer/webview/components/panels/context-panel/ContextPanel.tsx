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

import type {
  ContextPanelEditorState,
  EditorFooterRef,
  EditorBannerRef
} from "./views/editorTypes";
import { PaletteView } from "./views";

const MIN_WIDTH = 500;
function getMaxWidth() {
  return Math.floor(window.innerWidth / 2);
}
const TEXT_SECONDARY = "text.secondary";
const ACTION_HOVER = "action.hover";

type BannerRef = EditorBannerRef;
type FooterRef = EditorFooterRef;

interface SideConfig {
  isLeft: boolean;
  tooltipPlacement: "left" | "right";
  positionProp: "left" | "right";
  openIcon: typeof ChevronRightIcon;
  closeIcon: typeof ChevronLeftIcon;
  borderRadius: string;
  borderZeroProp: "borderLeft" | "borderRight";
  moveTargetLabel: "left" | "right";
}

function getSideConfig(side: "left" | "right"): SideConfig {
  if (side === "left") {
    return {
      isLeft: true,
      tooltipPlacement: "right",
      positionProp: "left",
      openIcon: ChevronRightIcon,
      closeIcon: ChevronLeftIcon,
      borderRadius: "0 4px 4px 0",
      borderZeroProp: "borderLeft",
      moveTargetLabel: "right"
    };
  }

  return {
    isLeft: false,
    tooltipPlacement: "left",
    positionProp: "right",
    openIcon: ChevronLeftIcon,
    closeIcon: ChevronRightIcon,
    borderRadius: "4px 0 0 4px",
    borderZeroProp: "borderRight",
    moveTargetLabel: "left"
  };
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

export interface ContextPanelEditorProps extends ContextPanelEditorState {}

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
  const sideConfig = getSideConfig(side);
  const anchorOffset = isOpen ? panelWidth : 0;
  const toggleTitle = isOpen ? "Close panel" : "Open panel";
  const ActiveIcon = isOpen ? sideConfig.closeIcon : sideConfig.openIcon;
  const handleToggle = useCallback(() => {
    if (isOpen) {
      onBack();
      onClose();
      return;
    }

    onOpen();
  }, [isOpen, onBack, onClose, onOpen]);

  const handleStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    cursor: "pointer",
    borderRadius: sideConfig.borderRadius,
    border: 1,
    [sideConfig.borderZeroProp]: 0,
    borderColor: "divider",
    bgcolor: "background.paper",
    "&:hover": { bgcolor: ACTION_HOVER }
  };

  return (
    <Box
      sx={{
        position: "absolute",
        [sideConfig.positionProp]: anchorOffset,
        top: "50%",
        transform: "translateY(-50%)",
        transition: isDragging
          ? "none"
          : (theme) =>
              theme.transitions.create(sideConfig.positionProp, {
                duration: theme.transitions.duration.short
              }),
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5
      }}
    >
      <Tooltip title={toggleTitle} placement={sideConfig.tooltipPlacement}>
        <Box
          onClick={handleToggle}
          data-testid="panel-toggle-btn"
          sx={{ ...handleStyle, height: 48 }}
        >
          <ActiveIcon sx={{ fontSize: 16, color: TEXT_SECONDARY }} />
        </Box>
      </Tooltip>
      {isOpen && (
        <Tooltip
          title={`Move panel to ${sideConfig.moveTargetLabel}`}
          placement={sideConfig.tooltipPlacement}
        >
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

function haveFooterHandlersChanged(prev: FooterRef | null, next: FooterRef | null): boolean {
  return (
    prev?.handleApply !== next?.handleApply ||
    prev?.handleSave !== next?.handleSave ||
    prev?.handleDiscard !== next?.handleDiscard
  );
}

function hasFooterRefChanged(prev: FooterRef | null, next: FooterRef | null): boolean {
  if (Boolean(prev) !== Boolean(next)) {
    return true;
  }
  if ((prev?.hasChanges ?? false) !== (next?.hasChanges ?? false)) {
    return true;
  }
  return haveFooterHandlersChanged(prev, next);
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
    const changed = hasFooterRefChanged(footerRef.current, ref);
    footerRef.current = ref;
    if (changed) {
      forceUpdate((n) => n + 1);
    }
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
  const showFooter = panelView.hasFooter && footer !== null;

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
                bgcolor: "action.hover",
                color: "text.secondary"
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

        {panelView.hasFooter && footer?.hasChanges === true && !isReadOnly && (
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

        {showFooter === true && !isReadOnly && (
          <>
            <Divider />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, p: 1.5 }}>
              <Button size="small" onClick={footer.handleApply} data-testid="panel-apply-btn">
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
