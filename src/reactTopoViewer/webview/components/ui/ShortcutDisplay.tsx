/**
 * ShortcutDisplay - Visual feedback for keyboard/mouse shortcuts
 * Displays detected input events as floating labels
 */
import React from "react";
import Box from "@mui/material/Box";

interface ShortcutDisplayItem {
  id: number;
  text: string;
}

interface ShortcutDisplayProps {
  shortcuts: ShortcutDisplayItem[];
}

export const ShortcutDisplay: React.FC<ShortcutDisplayProps> = ({ shortcuts }) => {
  if (shortcuts.length === 0) return null;

  return (
    <Box
      className="shortcut-display"
      sx={{
        position: "fixed",
        bottom: 16,
        left: 16,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-start",
        gap: 0.5,
        zIndex: 100000,
        pointerEvents: "none"
      }}
    >
      {shortcuts.map((shortcut) => (
        <Box
          key={shortcut.id}
          className="shortcut-display-item"
          sx={{
            px: 2,
            py: 0.75,
            borderRadius: 2,
            boxShadow: 3,
            fontFamily: "sans-serif",
            fontSize: "0.875rem",
            letterSpacing: "0.025em",
            animation: "shortcutFade 2s ease-in-out forwards"
          }}
        >
          {shortcut.text}
        </Box>
      ))}
    </Box>
  );
};
