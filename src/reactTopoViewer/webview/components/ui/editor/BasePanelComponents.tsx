/**
 * Sub-components for BasePanel
 */
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

export const PanelFooter: React.FC<{
  hasChanges: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  primary: string;
  secondary: string;
}> = ({ hasChanges, onPrimary, onSecondary, primary, secondary }) => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "flex-end",
      gap: 1,
      p: 2,
      borderTop: 1,
      borderColor: "divider",
      flexShrink: 0
    }}
  >
    <Button
      variant={hasChanges ? "contained" : "outlined"}
      size="small"
      onClick={onSecondary}
      data-testid="panel-apply-btn"
    >
      {secondary}
    </Button>
    <Button
      variant="contained"
      size="small"
      onClick={onPrimary}
      data-testid="panel-ok-btn"
    >
      {primary}
    </Button>
  </Box>
);

export const PanelHeader: React.FC<{
  title: string;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClose: () => void;
}> = ({ title, isDragging, onMouseDown, onClose }) => (
  <Box
    onMouseDown={onMouseDown}
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      px: 2,
      py: 1,
      borderBottom: 1,
      borderColor: "divider",
      cursor: isDragging ? "grabbing" : "grab",
      userSelect: "none",
      bgcolor: "background.paper"
    }}
  >
    <Typography variant="subtitle1" fontWeight={500} data-testid="panel-title">
      {title}
    </Typography>
    <IconButton
      size="small"
      onClick={onClose}
      aria-label="Close"
      data-testid="panel-close-btn"
      sx={{ ml: 1 }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>
);

export const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({
  onMouseDown
}) => (
  <Box
    onMouseDown={onMouseDown}
    title="Drag to resize"
    sx={{
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 16,
      height: 16,
      cursor: "nwse-resize",
      "&::after": {
        content: '""',
        position: "absolute",
        bottom: 4,
        right: 4,
        width: 8,
        height: 8,
        borderRight: 2,
        borderBottom: 2,
        borderColor: "divider",
        opacity: 0.6
      }
    }}
  />
);

export const Backdrop: React.FC<{ zIndex: number; onClick: () => void }> = ({
  zIndex,
  onClick
}) => (
  <Box
    onClick={onClick}
    sx={{
      position: "fixed",
      inset: 0,
      bgcolor: "rgba(0, 0, 0, 0.3)",
      zIndex: zIndex - 1
    }}
  />
);
