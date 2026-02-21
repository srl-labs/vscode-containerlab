// Inline code with click-to-copy.
import React from "react";
import Box from "@mui/material/Box";

import { copyToClipboard } from "../../../utils/clipboard";

interface CopyableCodeProps {
  children: string;
}

export const CopyableCode: React.FC<CopyableCodeProps> = ({ children }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    const success = await copyToClipboard(children);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [children]);

  return (
    <Box
      component="code"
      onClick={() => void handleCopy()}
      title="Click to copy"
      sx={{
        cursor: "pointer",
        userSelect: "text",
        borderRadius: 0.5,
        px: 0.5,
        py: 0.25,
        fontFamily: "monospace",
        transition: (theme) => theme.transitions.create("backgroundColor"),
        ...(copied ? { outline: "1px solid" } : {}),
      }}
    >
      {copied ? "Copied!" : children}
    </Box>
  );
};
