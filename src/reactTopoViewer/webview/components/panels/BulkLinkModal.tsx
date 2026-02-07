/**
 * BulkLinkModal - MUI Dialog wrapper for bulk link creation
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import type { TopoNode, TopoEdge } from "../../../shared/types/graph";
import { useGraphActions, useGraphState } from "../../stores/graphStore";

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

const ExamplesSection: React.FC = () => (
  <div className="rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 space-y-2">
    <Typography variant="subtitle2" fontWeight={600}>Examples</Typography>
    <div className="space-y-1.5 text-sm">
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>1.</Typography>
        <div>
          <Typography variant="body2" color="text.secondary">All leaves to all spines:</Typography>
          <div className="mt-0.5"><CopyableCode>leaf*</CopyableCode> → <CopyableCode>spine*</CopyableCode></div>
        </div>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>2.</Typography>
        <div>
          <Typography variant="body2" color="text.secondary">Pair by number (leaf1→spine1):</Typography>
          <div className="mt-0.5"><CopyableCode>{"leaf(\\d+)"}</CopyableCode> → <CopyableCode>spine$1</CopyableCode></div>
        </div>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>3.</Typography>
        <div>
          <Typography variant="body2" color="text.secondary">Single char match:</Typography>
          <div className="mt-0.5"><CopyableCode>srl?</CopyableCode> → <CopyableCode>client*</CopyableCode></div>
        </div>
      </Box>
    </div>
    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
      <Typography variant="body2" color="text.secondary" component="div">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <div><CopyableCode>*</CopyableCode> any chars</div>
          <div><CopyableCode>?</CopyableCode> single char</div>
          <div><CopyableCode>#</CopyableCode> single digit</div>
          <div><CopyableCode>$1</CopyableCode> capture group</div>
        </div>
      </Typography>
    </Box>
  </div>
);

export const BulkLinkModal: React.FC<BulkLinkModalProps> = ({ isOpen, mode, isLocked, onClose }) => {
  const { nodes, edges } = useGraphState();
  const { addEdge } = useGraphActions();

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
    computeAndValidateCandidates(nodes as TopoNode[], edges as TopoEdge[], sourcePattern, targetPattern, setStatus, setPendingCandidates);
  }, [nodes, edges, sourcePattern, targetPattern]);

  const handleConfirmCreate = React.useCallback(async () => {
    await confirmAndCreateLinks({ nodes: nodes as TopoNode[], edges: edges as TopoEdge[], pendingCandidates, canApply, addEdge, setStatus, setPendingCandidates, onClose });
  }, [nodes, edges, pendingCandidates, canApply, addEdge, onClose]);

  return (
    <>
      <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
          Bulk Link Devices
          <IconButton size="small" onClick={handleCancel}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Create multiple links by matching node names with patterns.
            </Typography>
            <ExamplesSection />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box>
                <Typography variant="caption" component="label" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Source Pattern<Typography component="span" color="error.main" sx={{ ml: 0.5 }}>*</Typography>
                </Typography>
                <TextField inputRef={sourceInputRef} size="small" fullWidth value={sourcePattern} onChange={(e) => setSourcePattern(e.target.value)} placeholder="e.g. leaf*, srl(\d+)" disabled={mode !== "edit"} />
              </Box>
              <Box>
                <Typography variant="caption" component="label" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Target Pattern<Typography component="span" color="error.main" sx={{ ml: 0.5 }}>*</Typography>
                </Typography>
                <TextField size="small" fullWidth value={targetPattern} onChange={(e) => setTargetPattern(e.target.value)} placeholder="e.g. spine*, client$1" disabled={mode !== "edit"} />
              </Box>
            </Box>
            {status && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1, borderRadius: 0.5, border: 1, borderColor: "divider", bgcolor: "var(--vscode-editor-background)" }}>
                {status}
              </Typography>
            )}
            {!canApply && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1, borderRadius: 0.5, border: 1, borderColor: "divider", bgcolor: "var(--vscode-editor-background)" }}>
                Bulk linking is disabled while locked or in view mode.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" size="small" onClick={handleCancel}>Cancel</Button>
          <Button variant="contained" size="small" onClick={handleCompute}>Apply</Button>
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
