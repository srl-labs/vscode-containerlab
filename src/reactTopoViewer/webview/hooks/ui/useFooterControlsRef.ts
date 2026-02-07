import { useEffect } from "react";

export type FooterControlsRef = {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
};

/**
 * Standardizes "footer ref" wiring for editor-like panels.
 *
 * Many panels expose the same {handleApply, handleSave, hasChanges} object to a parent footer.
 * Centralizing this avoids clone-heavy useEffect blocks and keeps dependencies consistent.
 */
export function useFooterControlsRef(
  onFooterRef: ((ref: FooterControlsRef | null) => void) | undefined,
  enabled: boolean,
  handleApply: () => void,
  handleSave: () => void,
  hasChanges: boolean
): void {
  useEffect(() => {
    if (!onFooterRef) return;
    onFooterRef(enabled ? { handleApply, handleSave, hasChanges } : null);
  }, [onFooterRef, enabled, handleApply, handleSave, hasChanges]);
}

