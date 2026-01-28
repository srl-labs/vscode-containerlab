/**
 * CopyableCode - Inline code with click-to-copy functionality
 */
import React from "react";

import { copyToClipboard } from "../../../utils/clipboard";

interface CopyableCodeProps {
  children: string;
  className?: string;
}

export const CopyableCode: React.FC<CopyableCodeProps> = ({ children, className = "" }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    const success = await copyToClipboard(children);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [children]);

  return (
    <code
      onClick={() => void handleCopy()}
      title="Click to copy"
      className={`cursor-pointer select-text rounded-sm bg-[var(--vscode-textCodeBlock-background)] px-1 py-0.5 font-mono text-xs transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${copied ? "ring-1 ring-[var(--vscode-focusBorder)]" : ""} ${className}`}
    >
      {copied ? "Copied!" : children}
    </code>
  );
};
