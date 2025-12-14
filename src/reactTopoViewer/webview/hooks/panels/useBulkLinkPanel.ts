/**
 * Hook for bulk link panel state and handlers
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import type { GraphChangeEntry } from '../index';
import type { LinkCandidate } from '../../components/panels/bulk-link/bulkLinkUtils';
import { computeAndValidateCandidates, confirmAndCreateLinks } from '../../components/panels/bulk-link/bulkLinkHandlers';

interface UseBulkLinkPanelOptions {
  isVisible: boolean;
  mode: 'edit' | 'view';
  isLocked: boolean;
  cy: CyCore | null;
  onClose: () => void;
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void;
}

export function useBulkLinkPanel({
  isVisible,
  mode,
  isLocked,
  cy,
  onClose,
  recordGraphChanges
}: UseBulkLinkPanelOptions) {
  const [sourcePattern, setSourcePattern] = React.useState('');
  const [targetPattern, setTargetPattern] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [pendingCandidates, setPendingCandidates] = React.useState<LinkCandidate[] | null>(null);
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isVisible) {
      setStatus(null);
      setPendingCandidates(null);
      setTimeout(() => sourceInputRef.current?.focus(), 0);
    }
  }, [isVisible]);

  const canApply = mode === 'edit' && !isLocked;

  const handleCancel = React.useCallback(() => {
    setPendingCandidates(null);
    setStatus(null);
    onClose();
  }, [onClose]);

  const handleCompute = React.useCallback(() => {
    computeAndValidateCandidates(cy, sourcePattern, targetPattern, setStatus, setPendingCandidates);
  }, [cy, sourcePattern, targetPattern]);

  const handleConfirmCreate = React.useCallback(() => {
    confirmAndCreateLinks({
      cy,
      pendingCandidates,
      canApply,
      recordGraphChanges,
      setStatus,
      setPendingCandidates,
      onClose
    });
  }, [cy, pendingCandidates, canApply, recordGraphChanges, onClose]);

  const handleDismissConfirm = React.useCallback(() => {
    setPendingCandidates(null);
  }, []);

  return {
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
  };
}
