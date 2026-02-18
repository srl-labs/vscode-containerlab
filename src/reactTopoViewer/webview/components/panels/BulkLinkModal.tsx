// Bulk link creation dialog.
import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

import type { TopoNode, TopoEdge } from "../../../shared/types/graph";
import { useGraphActions, useGraphStore } from "../../stores/graphStore";

import { CopyableCode } from "./bulk-link/CopyableCode";
import { ConfirmBulkLinksModal } from "./bulk-link/ConfirmBulkLinksModal";
import type { LinkCandidate } from "./bulk-link/bulkLinkUtils";
import { computeAndValidateCandidates, confirmAndCreateLinks } from "./bulk-link/bulkLinkHandlers";

interface BulkLinkModalProps {
  isOpen: boolean;
  mode: "edit" | "view";
  isLocked: boolean;
  onClose: () => void;
}

const FLEX_START = "flex-start";

type ExampleDefinition = {
  title: string;
  source: React.ReactNode;
  target: React.ReactNode;
};

const EXAMPLES: readonly ExampleDefinition[] = [
  {
    title: "All leaves to all spines:",
    source: <CopyableCode>leaf*</CopyableCode>,
    target: <CopyableCode>spine*</CopyableCode>
  },
  {
    title: "Pair by number (leaf1→spine1):",
    source: <CopyableCode>{"leaf(\\d+)"}</CopyableCode>,
    target: <CopyableCode>spine$1</CopyableCode>
  },
  {
    title: "Single char match:",
    source: <CopyableCode>srl?</CopyableCode>,
    target: <CopyableCode>client*</CopyableCode>
  }
] as const;

const ExampleRow: React.FC<{ index: number; def: ExampleDefinition }> = ({ index, def }) => (
  <Box sx={{ display: "flex", alignItems: FLEX_START, gap: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
      {index}.
    </Typography>
    <Box>
      <Typography variant="body2" color="text.secondary">
        {def.title}
      </Typography>
      <Box sx={{ mt: 0.25 }}>
        {def.source} → {def.target}
      </Box>
    </Box>
  </Box>
);

const ExamplesSection: React.FC = () => (
  <Alert severity="info" variant="outlined" icon={false}>
    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
      Examples
    </Typography>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, fontSize: "0.875rem" }}>
      {EXAMPLES.map((def, idx) => (
        <ExampleRow key={idx} index={idx + 1} def={def} />
      ))}
    </Box>
    <Divider sx={{ my: 1 }} />
    <Typography variant="body2" color="text.secondary" component="div">
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 1.5, rowGap: 0.25 }}>
        <Box>
          <CopyableCode>*</CopyableCode> any chars
        </Box>
        <Box>
          <CopyableCode>?</CopyableCode> single char
        </Box>
        <Box>
          <CopyableCode>#</CopyableCode> single digit
        </Box>
        <Box>
          <CopyableCode>$1</CopyableCode> capture group
        </Box>
      </Box>
    </Typography>
  </Alert>
);

export const BulkLinkModal: React.FC<BulkLinkModalProps> = ({
  isOpen,
  mode,
  isLocked,
  onClose
}) => {
  const { addEdge } = useGraphActions();
  const getCurrentNodes = React.useCallback(() => useGraphStore.getState().nodes as TopoNode[], []);
  const getCurrentEdges = React.useCallback(() => useGraphStore.getState().edges as TopoEdge[], []);

  const [sourcePattern, setSourcePattern] = React.useState("");
  const [targetPattern, setTargetPattern] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [pendingCandidates, setPendingCandidates] = React.useState<LinkCandidate[] | null>(null);
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStatus(null);
      setPendingCandidates(null);
      setTimeout(() => sourceInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const canApply = mode === "edit" && !isLocked;

  const handleCancel = React.useCallback(() => {
    setPendingCandidates(null);
    setStatus(null);
    onClose();
  }, [onClose]);

  const handleCompute = React.useCallback(() => {
    const nodes = getCurrentNodes();
    const edges = getCurrentEdges();
    computeAndValidateCandidates(
      nodes,
      edges,
      sourcePattern,
      targetPattern,
      setStatus,
      setPendingCandidates
    );
  }, [getCurrentNodes, getCurrentEdges, sourcePattern, targetPattern]);

  const handleConfirmCreate = React.useCallback(async () => {
    const nodes = getCurrentNodes();
    const edges = getCurrentEdges();
    await confirmAndCreateLinks({
      nodes,
      edges,
      pendingCandidates,
      canApply,
      addEdge,
      setStatus,
      setPendingCandidates,
      onClose
    });
  }, [getCurrentNodes, getCurrentEdges, pendingCandidates, canApply, addEdge, onClose]);

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={handleCancel}
        maxWidth="sm"
        fullWidth
        data-testid="bulk-link-modal"
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
        >
          Bulk Link Devices
          <IconButton size="small" onClick={handleCancel} data-testid="bulk-link-close-btn">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Create multiple links by matching node names with patterns.
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <TextField
                inputRef={sourceInputRef}
                label="Source Pattern"
                required
                size="small"
                fullWidth
                value={sourcePattern}
                onChange={(e) => setSourcePattern(e.target.value)}
                placeholder="e.g. leaf*, srl(\d+)"
                disabled={mode !== "edit"}
                data-testid="bulk-link-source"
              />
              <TextField
                label="Target Pattern"
                required
                size="small"
                fullWidth
                value={targetPattern}
                onChange={(e) => setTargetPattern(e.target.value)}
                placeholder="e.g. spine*, client$1"
                disabled={mode !== "edit"}
                data-testid="bulk-link-target"
              />
            </Box>
            <ExamplesSection />
            {status && (
              <Alert severity="info" variant="outlined">
                {status}
              </Alert>
            )}
            {!canApply && (
              <Alert severity="warning" variant="outlined">
                Bulk linking is disabled while locked or in view mode.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            size="small"
            onClick={handleCompute}
            data-testid="bulk-link-apply-btn"
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmBulkLinksModal
        isOpen={!!pendingCandidates}
        count={pendingCandidates?.length ?? 0}
        sourcePattern={sourcePattern.trim()}
        targetPattern={targetPattern.trim()}
        onCancel={() => setPendingCandidates(null)}
        onConfirm={() => void handleConfirmCreate()}
      />
    </>
  );
};
