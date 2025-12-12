/**
 * BulkLinkPanel - Create multiple links based on name patterns
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { BasePanel } from '../../shared/editor/BasePanel';
import type { GraphChangeEntry } from '../../../hooks';
import { useBulkLinkPanel } from './useBulkLinkPanel';
import { CopyableCode } from './CopyableCode';
import { ConfirmBulkLinksModal } from './ConfirmBulkLinksModal';

interface BulkLinkPanelProps {
  isVisible: boolean;
  mode: 'edit' | 'view';
  isLocked: boolean;
  cy: CyCore | null;
  onClose: () => void;
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void;
  storageKey?: string;
}

const ExamplesSection: React.FC = () => (
  <div className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 space-y-2">
    <div className="text-sm font-medium text-[var(--vscode-foreground)]">Examples</div>

    <div className="space-y-1.5 text-sm text-secondary">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[var(--vscode-symbolIcon-variableForeground)]">1.</span>
        <div>
          <span>All leaves to all spines:</span>
          <div className="mt-0.5"><CopyableCode>leaf*</CopyableCode> → <CopyableCode>spine*</CopyableCode></div>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[var(--vscode-symbolIcon-variableForeground)]">2.</span>
        <div>
          <span>Pair by number (leaf1→spine1):</span>
          <div className="mt-0.5"><CopyableCode>leaf(\d+)</CopyableCode> → <CopyableCode>spine$1</CopyableCode></div>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <span className="shrink-0 text-[var(--vscode-symbolIcon-variableForeground)]">3.</span>
        <div>
          <span>Single char match:</span>
          <div className="mt-0.5"><CopyableCode>srl?</CopyableCode> → <CopyableCode>client*</CopyableCode></div>
        </div>
      </div>
    </div>

    <div className="border-t border-[var(--vscode-panel-border)] pt-2 text-sm text-secondary">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div><CopyableCode>*</CopyableCode> any chars</div>
        <div><CopyableCode>?</CopyableCode> single char</div>
        <div><CopyableCode>#</CopyableCode> single digit</div>
        <div><CopyableCode>$1</CopyableCode> capture group</div>
      </div>
    </div>
  </div>
);

export const BulkLinkPanel: React.FC<BulkLinkPanelProps> = ({
  isVisible,
  mode,
  isLocked,
  cy,
  onClose,
  recordGraphChanges,
  storageKey = 'bulk-link'
}) => {
  const {
    sourcePattern,
    setSourcePattern,
    targetPattern,
    setTargetPattern,
    status,
    pendingCandidates,
    sourceInputRef,
    canApply,
    handleCancel,
    handleCompute,
    handleConfirmCreate,
    handleDismissConfirm
  } = useBulkLinkPanel({ isVisible, mode, isLocked, cy, onClose, recordGraphChanges });

  return (
    <>
      <BasePanel
        title="Bulk Link Devices"
        isVisible={isVisible}
        onClose={handleCancel}
        storageKey={storageKey}
        width={400}
        initialPosition={{ x: 400, y: 150 }}
        primaryLabel="Apply"
        secondaryLabel="Cancel"
        onPrimaryClick={handleCompute}
        onSecondaryClick={handleCancel}
      >
        <div className="space-y-3">
          <p className="text-sm text-secondary">
            Create multiple links by matching node names with patterns.
          </p>

          <ExamplesSection />

          <div className="space-y-2">
            <div className="form-group">
              <label className="block vscode-label mb-1">
                Source Pattern<span className="text-[var(--vscode-editorError-foreground)] ml-0.5">*</span>
              </label>
              <input
                ref={sourceInputRef}
                type="text"
                className="input-field"
                value={sourcePattern}
                onChange={(e) => setSourcePattern(e.target.value)}
                placeholder="e.g. leaf*, srl(\d+)"
                disabled={mode !== 'edit'}
              />
            </div>

            <div className="form-group">
              <label className="block vscode-label mb-1">
                Target Pattern<span className="text-[var(--vscode-editorError-foreground)] ml-0.5">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                value={targetPattern}
                onChange={(e) => setTargetPattern(e.target.value)}
                placeholder="e.g. spine*, client$1"
                disabled={mode !== 'edit'}
              />
            </div>
          </div>

          {status && (
            <div className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 text-sm text-secondary">
              {status}
            </div>
          )}

          {!canApply && (
            <div className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 text-sm text-secondary">
              Bulk linking is disabled while locked or in view mode.
            </div>
          )}
        </div>
      </BasePanel>

      <ConfirmBulkLinksModal
        isOpen={!!pendingCandidates}
        count={pendingCandidates?.length ?? 0}
        sourcePattern={sourcePattern.trim()}
        targetPattern={targetPattern.trim()}
        onCancel={handleDismissConfirm}
        onConfirm={handleConfirmCreate}
      />
    </>
  );
};
