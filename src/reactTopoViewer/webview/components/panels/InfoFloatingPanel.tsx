/**
 * Floating Panel Component
 * A draggable, closeable panel that floats over the canvas.
 * Uses BasePanel for shared drag/persistence behavior.
 */
import type { ReactNode } from "react";
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { BasePanel } from "../ui/editor/BasePanel";

interface FloatingPanelProps {
  title: string;
  children: ReactNode;
  isVisible: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  width?: number;
  height?: number;
  storageKey?: string;
  zIndex?: number;
  /** Enable diagonal resizing (default: true) */
  resizable?: boolean;
  /** Minimum width when resizing */
  minWidth?: number;
  /** Minimum height when resizing */
  minHeight?: number;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  children,
  isVisible,
  onClose,
  initialPosition = { x: 20, y: 80 },
  width = 320,
  height,
  storageKey,
  zIndex = 9999,
  resizable = true,
  minWidth,
  minHeight
}) => {
  return (
    <BasePanel
      title={title}
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={initialPosition}
      width={width}
      height={height}
      storageKey={storageKey}
      zIndex={zIndex}
      footer={false}
      resizable={resizable}
      minWidth={minWidth}
      minHeight={minHeight}
    >
      <Box sx={{ p: 2 }}>{children}</Box>
    </BasePanel>
  );
};

/**
 * Property Row Component for consistent panel layouts
 */
interface PropertyRowProps {
  label: string;
  value: string | ReactNode;
}

export const PropertyRow: React.FC<PropertyRowProps> = ({ label, value }) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ mb: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ textAlign: "center", wordBreak: "break-all" }}>
      {value || "N/A"}
    </Typography>
  </Box>
);
