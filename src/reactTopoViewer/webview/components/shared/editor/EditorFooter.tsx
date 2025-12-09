/**
 * EditorFooter - Apply/OK buttons for editor panels
 */
import React from 'react';

interface EditorFooterProps {
  onApply: () => void;
  onSave: () => void;
  applyLabel?: string;
  saveLabel?: string;
  disabled?: boolean;
}

export const EditorFooter: React.FC<EditorFooterProps> = ({
  onApply,
  onSave,
  applyLabel = 'Apply',
  saveLabel = 'OK',
  disabled
}) => (
  <div
    className="panel-footer flex justify-end gap-2 p-2 border-t flex-shrink-0"
    style={{ borderColor: 'var(--vscode-panel-border)' }}
  >
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={onApply}
      disabled={disabled}
      title="Apply changes without closing"
    >
      {applyLabel}
    </button>
    <button
      type="button"
      className="btn btn-primary btn-small"
      onClick={onSave}
      disabled={disabled}
      title="Apply changes and close"
    >
      {saveLabel}
    </button>
  </div>
);
