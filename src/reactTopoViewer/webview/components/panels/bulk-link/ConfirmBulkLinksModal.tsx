/**
 * ConfirmBulkLinksModal - Confirmation dialog for bulk link creation
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box
        sx={{
          p: 1,
          borderRadius: 0.5,
          border: 1,
          borderColor: "divider",
          bgcolor: "var(--vscode-editor-background)"
        }}
      >
        <Typography variant="body2">
          Create <strong>{count}</strong> new link{count === 1 ? "" : "s"}?
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Source: <code className="select-text">{sourcePattern}</code>
          </Typography>
          <br />
          <Typography variant="caption" color="text.secondary">
            Target: <code className="select-text">{targetPattern}</code>
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
        <Button variant="outlined" size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" size="small" onClick={onConfirm}>
          Create Links
        </Button>
      </Box>
    </Box>
  </BasePanel>
);
