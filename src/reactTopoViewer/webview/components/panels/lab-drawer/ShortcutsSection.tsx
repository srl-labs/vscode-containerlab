/**
 * ShortcutsSection - Displays keyboard shortcuts and interactions
 * Migrated from ShortcutsPanel for use in the Settings Drawer
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";



/** Platform detection for keyboard symbols */
const isMac =
  typeof window !== "undefined" &&
  typeof window.navigator !== "undefined" &&
  /macintosh/i.test(window.navigator.userAgent);

/** Converts modifier keys based on platform */
function formatKey(key: string): string {
  if (!isMac) return key;
  return key.replace(/Ctrl/g, "Cmd").replace(/Alt/g, "Option");
}

interface ShortcutRowProps {
  label: string;
  shortcut: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ label, shortcut }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.5 }}>
    <Typography variant="body2">{label}</Typography>
    <Chip
      label={formatKey(shortcut)}
      size="small"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.75rem",
        height: 22,
      }}
    />
  </Box>
);

interface ShortcutSectionProps {
  title: string;
  color: string;
  children: React.ReactNode;
}

const ShortcutSection: React.FC<ShortcutSectionProps> = ({ title, color, children }) => (
  <Box sx={{ mb: 3 }}>
    <Typography
      variant="subtitle2"
      sx={{ color, fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
    >
      {title}
    </Typography>
    <Box sx={{ pl: 0 }}>{children}</Box>
  </Box>
);

export const ShortcutsSection: React.FC = () => {
  return (
    <Box sx={{ p: 2 }}>
      {/* Viewer Mode */}
      <ShortcutSection title="Viewer Mode" color="success.main">
        <ShortcutRow label="Select node/link" shortcut="Left Click" />
        <ShortcutRow label="Node actions" shortcut="Right Click" />
        <ShortcutRow label="Capture packets" shortcut="Right Click + Link" />
        <ShortcutRow label="Move nodes" shortcut="Drag" />
      </ShortcutSection>

      {/* Editor Mode */}
      <ShortcutSection title="Editor Mode" color="info.main">
        <ShortcutRow label="Add node" shortcut="Shift + Click" />
        <ShortcutRow label="Create link" shortcut="Shift + Click node" />
        <ShortcutRow label="Delete element" shortcut="Alt + Click" />
        <ShortcutRow label="Context menu" shortcut="Right Click" />
        <ShortcutRow label="Select all" shortcut="Ctrl + A" />
        <ShortcutRow label="Multi-select" shortcut="Ctrl + Click" />
        <ShortcutRow label="Copy selected" shortcut="Ctrl + C" />
        <ShortcutRow label="Paste" shortcut="Ctrl + V" />
        <ShortcutRow label="Duplicate selected" shortcut="Ctrl + D" />
        <ShortcutRow label="Undo" shortcut="Ctrl + Z" />
        <ShortcutRow label="Redo" shortcut="Ctrl + Y" />
        <ShortcutRow label="Create group" shortcut="Ctrl + G" />
        <ShortcutRow label="Delete selected" shortcut="Del" />
      </ShortcutSection>

      {/* Navigation */}
      <ShortcutSection title="Navigation" color="secondary.main">
        <ShortcutRow label="Deselect all" shortcut="Esc" />
      </ShortcutSection>

      {/* Tips */}
      <ShortcutSection title="Tips" color="warning.main">
        <Typography variant="body2" component="ul" sx={{ pl: 2, m: 0, "& li": { mb: 0.5 } }}>
          <li>Use layout algorithms to auto-arrange</li>
          <li>
            Box select nodes, then <code>Ctrl+G</code> to group or <code>Del</code> to delete
          </li>
          <li>Double-click any item to directly edit</li>
          <li>Shift+Click a node to start creating a link</li>
        </Typography>
      </ShortcutSection>
    </Box>
  );
};
