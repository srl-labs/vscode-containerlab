/**
 * ConfirmBulkLinksModal - Confirmation dialog for bulk link creation
 */
import React from "react";

import { BasePanel } from "../../ui/editor/BasePanel";

interface ConfirmBulkLinksModalProps {
  isOpen: boolean;
  count: number;
  sourcePattern: string;
  targetPattern: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmBulkLinksModal: React.FC<ConfirmBulkLinksModalProps> = ({
  isOpen,
  count,
  sourcePattern,
  targetPattern,
  onCancel,
  onConfirm
}) => (
  <BasePanel
    title="Bulk Link Creation"
    isVisible={isOpen}
    onClose={onCancel}
    storageKey="bulk-link-confirm"
    backdrop={true}
    width={420}
    zIndex={10000}
    footer={false}
  >
    <div className="space-y-3">
      <div className="rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2">
        <div className="text-sm">
          Create <span className="font-semibold">{count}</span> new link{count === 1 ? "" : "s"}?
        </div>
        <div className="mt-1 text-xs text-secondary">
          <div>
            Source: <code className="select-text">{sourcePattern}</code>
          </div>
          <div>
            Target: <code className="select-text">{targetPattern}</code>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-small" onClick={onConfirm}>
          Create Links
        </button>
      </div>
    </div>
  </BasePanel>
);
