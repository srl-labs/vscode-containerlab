/**
 * CopyableCode - Inline code with click-to-copy functionality
 */
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
        bgcolor: "var(--vscode-textCodeBlock-background)",
        px: 0.5,
        py: 0.25,
        fontFamily: "monospace",
        fontSize: "0.75rem",
        transition: "background-color 0.2s",
        "&:hover": { bgcolor: "var(--vscode-list-hoverBackground)" },
        ...(copied ? { outline: "1px solid var(--vscode-focusBorder)" } : {})
      }}
    >
      {copied ? "Copied!" : children}
    </Box>
  );
};
