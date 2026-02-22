import React from "react";
import {
  Autorenew as AutorenewIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  ErrorOutline as ErrorOutlineIcon
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography
} from "@mui/material";

import type {
  LifecycleLogEntry,
  LifecycleStatus,
  ProcessingMode
} from "../../stores/topoViewerStore";
import { calculateElapsedSeconds, formatElapsedSeconds } from "../../utils/lifecycleTimer";

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

function renderStatusIcon(status: LifecycleStatus, isProcessing: boolean): React.ReactElement {
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

function renderStatusChipIcon(status: LifecycleStatus, isProcessing: boolean): React.ReactElement {
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
  const wasProcessingRef = React.useRef(isProcessing);
  const [startedAtMs, setStartedAtMs] = React.useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    if (!isOpen) {
      setStartedAtMs(null);
      setElapsedSeconds(0);
      return;
    }

    if (!isProcessing || status !== "running") {
      return;
    }

    const startedAt = Date.now();
    setStartedAtMs(startedAt);
    setElapsedSeconds(0);

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(calculateElapsedSeconds(startedAt));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOpen, isProcessing, status]);

  React.useEffect(() => {
    if (isOpen && wasProcessingRef.current && !isProcessing && startedAtMs !== null) {
      setElapsedSeconds(calculateElapsedSeconds(startedAtMs));
    }
    wasProcessingRef.current = isProcessing;
  }, [isOpen, isProcessing, startedAtMs]);

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
  const timerLabel = isProcessing ? "Elapsed" : "Duration";
  const formattedDuration = formatElapsedSeconds(elapsedSeconds);

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
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.25 }}
            data-testid="lifecycle-timer"
          >
            {timerLabel}: {formattedDuration}
          </Typography>
        </Box>
      </DialogTitle>
      {isProcessing && <LinearProgress />}
      <DialogContent dividers sx={{ pt: 2 }}>
        {statusMessage !== undefined && statusMessage !== null && statusMessage.length > 0 && (
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
