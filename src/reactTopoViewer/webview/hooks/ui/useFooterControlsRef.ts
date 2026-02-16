import { useEffect } from "react";

export type FooterControlsRef = {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
};

// Standardizes footer ref wiring for editor panels.
export function useFooterControlsRef(
  onFooterRef: ((ref: FooterControlsRef | null) => void) | undefined,
  enabled: boolean,
  handleApply: () => void,
  handleSave: () => void,
  hasChanges: boolean,
  handleDiscard?: () => void
): void {
  useEffect(() => {
    if (!onFooterRef) return;
    onFooterRef(
      enabled
        ? { handleApply, handleSave, handleDiscard: handleDiscard ?? (() => {}), hasChanges }
        : null
    );
    return () => onFooterRef(null);
  }, [onFooterRef, enabled, handleApply, handleSave, handleDiscard, hasChanges]);
}
