/**
 * BulkLinkPanel - Create multiple links based on name patterns
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";

import { BasePanel } from "../../ui/editor/BasePanel";
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import { useGraphActions, useGraphState } from "../../../stores/graphStore";

import { CopyableCode } from "./CopyableCode";
import { ConfirmBulkLinksModal } from "./ConfirmBulkLinksModal";
import type { LinkCandidate } from "./bulkLinkUtils";
import { computeAndValidateCandidates, confirmAndCreateLinks } from "./bulkLinkHandlers";

interface BulkLinkPanelProps {
  isVisible: boolean;
  mode: "edit" | "view";
  isLocked: boolean;
  onClose: () => void;
  storageKey?: string;
}

const ExamplesSection: React.FC = () => (
  <div className="rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 space-y-2">
    <Typography variant="subtitle2" fontWeight={600}>
      Examples
    </Typography>

    <div className="space-y-1.5 text-sm">
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          1.
        </Typography>
        <div>
          <Typography variant="body2" color="text.secondary">
            All leaves to all spines:
          </Typography>
          <div className="mt-0.5">
            <CopyableCode>leaf*</CopyableCode> → <CopyableCode>spine*</CopyableCode>
          </div>
        </div>
      </Box>

      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          2.
        </Typography>
        <div>
          <Typography variant="body2" color="text.secondary">
            Pair by number (leaf1→spine1):
          </Typography>
          <div className="mt-0.5">
            <CopyableCode>leaf(\d+)</CopyableCode> → <CopyableCode>spine$1</CopyableCode>
          </div>
        </div>
      </Box>

      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          3.
        </Typography>
        <div>
          <Typography variant="body2" color="text.secondary">
            Single char match:
          </Typography>
          <div className="mt-0.5">
            <CopyableCode>srl?</CopyableCode> → <CopyableCode>client*</CopyableCode>
          </div>
        </div>
      </Box>
    </div>

    <Box
      sx={{
        borderTop: 1,
        borderColor: "divider",
        pt: 1
      }}
    >
      <Typography variant="body2" color="text.secondary" component="div">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <div>
            <CopyableCode>*</CopyableCode> any chars
          </div>
          <div>
            <CopyableCode>?</CopyableCode> single char
          </div>
          <div>
            <CopyableCode>#</CopyableCode> single digit
          </div>
          <div>
            <CopyableCode>$1</CopyableCode> capture group
          </div>
        </div>
      </Typography>
    </Box>
  </div>
);

type UseBulkLinkPanelOptions = Omit<BulkLinkPanelProps, "storageKey">;

function useBulkLinkPanel({ isVisible, mode, isLocked, onClose }: UseBulkLinkPanelOptions) {
  // Get nodes and edges from graph store
  const { nodes, edges } = useGraphState();
  const { addEdge } = useGraphActions();

  const [sourcePattern, setSourcePattern] = React.useState("");
  const [targetPattern, setTargetPattern] = React.useState("");
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

  const canApply = mode === "edit" && !isLocked;

  const handleCancel = React.useCallback(() => {
    setPendingCandidates(null);
    setStatus(null);
    onClose();
  }, [onClose]);

  const handleCompute = React.useCallback(() => {
    computeAndValidateCandidates(
      nodes as TopoNode[],
      edges as TopoEdge[],
      sourcePattern,
      targetPattern,
      setStatus,
      setPendingCandidates
    );
  }, [nodes, edges, sourcePattern, targetPattern]);

  const handleConfirmCreate = React.useCallback(async () => {
    await confirmAndCreateLinks({
      nodes: nodes as TopoNode[],
      edges: edges as TopoEdge[],
      pendingCandidates,
      canApply,
      addEdge,
      setStatus,
      setPendingCandidates,
      onClose
    });
  }, [nodes, edges, pendingCandidates, canApply, addEdge, onClose]);

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

export const BulkLinkPanel: React.FC<BulkLinkPanelProps> = ({
  isVisible,
  mode,
  isLocked,
  onClose,
  storageKey = "bulk-link"
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
  } = useBulkLinkPanel({ isVisible, mode, isLocked, onClose });

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
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Create multiple links by matching node names with patterns.
          </Typography>

          <ExamplesSection />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box>
              <Typography variant="caption" component="label" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Source Pattern
                <Typography component="span" color="error.main" sx={{ ml: 0.5 }}>
                  *
                </Typography>
              </Typography>
              <TextField
                inputRef={sourceInputRef}
                size="small"
                fullWidth
                value={sourcePattern}
                onChange={(e) => setSourcePattern(e.target.value)}
                placeholder="e.g. leaf*, srl(\d+)"
                disabled={mode !== "edit"}
              />
            </Box>

            <Box>
              <Typography variant="caption" component="label" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Target Pattern
                <Typography component="span" color="error.main" sx={{ ml: 0.5 }}>
                  *
                </Typography>
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={targetPattern}
                onChange={(e) => setTargetPattern(e.target.value)}
                placeholder="e.g. spine*, client$1"
                disabled={mode !== "edit"}
              />
            </Box>
          </Box>

          {status && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                p: 1,
                borderRadius: 0.5,
                border: 1,
                borderColor: "divider",
                bgcolor: "var(--vscode-editor-background)"
              }}
            >
              {status}
            </Typography>
          )}

          {!canApply && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                p: 1,
                borderRadius: 0.5,
                border: 1,
                borderColor: "divider",
                bgcolor: "var(--vscode-editor-background)"
              }}
            >
              Bulk linking is disabled while locked or in view mode.
            </Typography>
          )}
        </Box>
      </BasePanel>

      <ConfirmBulkLinksModal
        isOpen={!!pendingCandidates}
        count={pendingCandidates?.length ?? 0}
        sourcePattern={sourcePattern.trim()}
        targetPattern={targetPattern.trim()}
        onCancel={handleDismissConfirm}
        onConfirm={() => void handleConfirmCreate()}
      />
    </>
  );
};
