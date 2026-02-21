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
    if (!enabled) {
      onFooterRef(null);
      return;
    }
    onFooterRef({
      handleApply,
      handleSave,
      handleDiscard: handleDiscard ?? (() => {}),
      hasChanges,
    });
  }, [onFooterRef, enabled, handleApply, handleSave, handleDiscard, hasChanges]);

  useEffect(
    () => () => {
      onFooterRef?.(null);
    },
    [onFooterRef]
  );
}
