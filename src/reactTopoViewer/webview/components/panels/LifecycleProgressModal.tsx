import React from "react";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

import type { LifecycleLogEntry, LifecycleStatus, ProcessingMode } from "../../stores/topoViewerStore";

interface LifecycleProgressModalProps {
  isOpen: boolean;
  isProcessing: boolean;
  mode: ProcessingMode;
  status: LifecycleStatus;
  statusMessage?: string | null;
  labName: string;
  logs: LifecycleLogEntry[];
  onClose: () => void;
  onCancel: () => void;
}

function getModeLabel(mode: ProcessingMode): string {
  if (mode === "destroy") {
    return "Destroying";
  }
  return "Deploying";
}

function getStatusLabel(status: LifecycleStatus): string {
  if (status === "success") {
    return "Completed";
  }
  if (status === "error") {
    return "Failed";
  }
  return "In Progress";
}

function getStatusColor(status: LifecycleStatus): "primary" | "success" | "error" {
  if (status === "success") {
    return "success";
  }
  if (status === "error") {
    return "error";
  }
  return "primary";
}

function renderStatusIcon(
  status: LifecycleStatus,
  isProcessing: boolean
): React.ReactElement {
  if (isProcessing) {
    return <CircularProgress size={20} thickness={5} />;
  }
  if (status === "success") {
    return <CheckCircleOutlineIcon color="success" sx={{ fontSize: 22 }} />;
  }
  if (status === "error") {
    return <ErrorOutlineIcon color="error" sx={{ fontSize: 22 }} />;
  }
  return <AutorenewIcon color="primary" sx={{ fontSize: 20 }} />;
}

function renderStatusChipIcon(
  status: LifecycleStatus,
  isProcessing: boolean
): React.ReactElement {
  if (isProcessing) {
    return <AutorenewIcon fontSize="small" />;
  }
  if (status === "success") {
    return <CheckCircleOutlineIcon fontSize="small" />;
  }
  if (status === "error") {
    return <ErrorOutlineIcon fontSize="small" />;
  }
  return <AutorenewIcon fontSize="small" />;
}

export const LifecycleProgressModal: React.FC<LifecycleProgressModalProps> = ({
  isOpen,
  isProcessing,
  mode,
  status,
  statusMessage,
  labName,
  logs,
  onClose,
  onCancel
}) => {
  const logContainerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const container = logContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [isOpen, logs]);

  const modeLabel = getModeLabel(mode);
  const statusLabel = getStatusLabel(status);
  const statusColor = getStatusColor(status);

  return (
    <Dialog
      open={isOpen}
      onClose={isProcessing ? () => undefined : onClose}
      disableEscapeKeyDown={isProcessing}
      maxWidth="md"
      fullWidth
      data-testid="lifecycle-progress-modal"
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(2px)",
            backgroundColor: "rgba(0, 0, 0, 0.35)"
          }
        },
        paper: {
          sx: {
            overflow: "hidden"
          }
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1.5 }}>
        {renderStatusIcon(status, isProcessing)}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {modeLabel} lab
            </Typography>
            <Chip
              size="small"
              icon={renderStatusChipIcon(status, isProcessing)}
              label={statusLabel}
              color={statusColor}
              variant="outlined"
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {labName || "Containerlab topology"}
          </Typography>
        </Box>
      </DialogTitle>
      {isProcessing && <LinearProgress />}
      <DialogContent dividers sx={{ pt: 2 }}>
        {statusMessage && (
          <Typography variant="body2" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {statusMessage}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Live command output
        </Typography>
        <Box
          ref={logContainerRef}
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.default",
            minHeight: 220,
            maxHeight: 320,
            overflowY: "auto",
            p: 1.25
          }}
        >
          {logs.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Waiting for command output...
            </Typography>
          )}
          {logs.map((entry, index) => (
            <Typography
              key={`${entry.stream}-${index}`}
              component="div"
              variant="body2"
              sx={{
                fontFamily:
                  "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.4
              }}
            >
              {entry.line}
            </Typography>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        {isProcessing ? (
          <Button
            size="small"
            color="secondary"
            variant="contained"
            onClick={onCancel}
            data-testid="lifecycle-cancel-btn"
          >
            Cancel
          </Button>
        ) : (
          <Button size="small" variant="contained" onClick={onClose} data-testid="lifecycle-ok-btn">
            OK
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
