/**
 * DevSettingsOverlay - MUI-based dev mode overlay
 *
 * A single top-center bar that shows "DEV" and expands into a popover
 * with topology file selection, mode switching, and theme toggling.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Popover from "@mui/material/Popover";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import SettingsIcon from "@mui/icons-material/Settings";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import type { DevStateManager, TopoMode } from "../mock/DevState";

// ============================================================================
// Types
// ============================================================================

interface TopologyFile {
  filename: string;
  path: string;
  hasAnnotations: boolean;
}

export interface DevSettingsOverlayProps {
  stateManager: DevStateManager;
  loadTopologyFile: (filePath: string) => Promise<void>;
  listTopologyFiles: () => Promise<TopologyFile[]>;
  resetFiles: () => Promise<void>;
  getCurrentFile: () => string | null;
  setMode: (mode: TopoMode) => void;
  onToggleTheme: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const DevSettingsOverlay: React.FC<DevSettingsOverlayProps> = ({
  stateManager,
  loadTopologyFile,
  listTopologyFiles,
  resetFiles,
  getCurrentFile,
  setMode,
  onToggleTheme
}) => {
  const chipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<TopoMode>(stateManager.getMode());
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains("light"));
  const [files, setFiles] = useState<TopologyFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [status, setStatus] = useState("");

  // Subscribe to state manager
  useEffect(() => {
    const unsub = stateManager.subscribe((state) => {
      setModeState(state.mode);
    });
    return unsub;
  }, [stateManager]);

  // Load file list on mount
  const refreshFiles = useCallback(async () => {
    setStatus("Loading files...");
    try {
      const list = await listTopologyFiles();
      setFiles(list);
      setStatus(`${list.length} files`);
      const current = getCurrentFile();
      if (current) setSelectedFile(current);
    } catch {
      setStatus("Error loading files");
    }
  }, [listTopologyFiles, getCurrentFile]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const handleFileChange = useCallback(
    async (path: string) => {
      if (!path) return;
      setSelectedFile(path);
      setStatus("Loading...");
      try {
        await loadTopologyFile(path);
        setStatus("Loaded");
      } catch {
        setStatus("Error loading file");
      }
    },
    [loadTopologyFile]
  );

  const handleReset = useCallback(async () => {
    setStatus("Resetting...");
    try {
      await resetFiles();
      setStatus("Reset complete");
      await refreshFiles();
    } catch {
      setStatus("Reset failed");
    }
  }, [resetFiles, refreshFiles]);

  const handleModeChange = useCallback(
    (_: unknown, value: TopoMode | null) => {
      if (value) setMode(value);
    },
    [setMode]
  );

  const handleThemeToggle = useCallback(() => {
    onToggleTheme();
    setIsLight((prev) => !prev);
  }, [onToggleTheme]);

  return (
    <>
      {/* Single top-center chip — click to open settings */}
      <Chip
        ref={chipRef}
        icon={<SettingsIcon sx={{ fontSize: 14 }} />}
        label="DEV"
        size="small"
        color="warning"
        onClick={() => setOpen((o) => !o)}
        sx={{
          position: "fixed",
          top: 6,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          fontWeight: 700,
          letterSpacing: 1,
          height: 24,
          cursor: "pointer",
          boxShadow: 2
        }}
      />

      {/* Settings Popover */}
      <Popover
        open={open}
        anchorEl={chipRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: { sx: { width: 280, mt: 0.5 } }
        }}
      >
        <Paper elevation={0} sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Dev Settings
          </Typography>
          <Divider sx={{ mb: 1.5 }} />

          {/* Topology Files */}
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Topology Files
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Select
                value={selectedFile}
                onChange={(e) => void handleFileChange(e.target.value)}
                displayEmpty
                size="small"
                sx={{ flex: 1, fontSize: 12 }}
              >
                <MenuItem value="" disabled>
                  <em>Select a file</em>
                </MenuItem>
                {files.map((f) => (
                  <MenuItem key={f.path} value={f.path} sx={{ fontSize: 12 }}>
                    {f.filename}
                    {f.hasAnnotations ? " (+)" : ""}
                  </MenuItem>
                ))}
              </Select>
              <IconButton size="small" onClick={() => void refreshFiles()} title="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Button
              size="small"
              color="error"
              variant="text"
              startIcon={<RestartAltIcon />}
              onClick={() => void handleReset()}
              sx={{ fontSize: 11, justifyContent: "flex-start" }}
            >
              Reset Files
            </Button>
            {status && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {status}
              </Typography>
            )}
          </Stack>

          <Divider sx={{ mb: 1.5 }} />

          {/* Mode */}
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Mode
            </Typography>
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={handleModeChange}
              size="small"
              fullWidth
            >
              <ToggleButton value="edit" sx={{ fontSize: 12, py: 0.5 }}>
                Edit
              </ToggleButton>
              <ToggleButton value="view" sx={{ fontSize: 12, py: 0.5 }}>
                View
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Divider sx={{ mb: 1.5 }} />

          {/* Theme */}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Light Theme
            </Typography>
            <Switch checked={isLight} onChange={handleThemeToggle} size="small" />
          </Stack>
        </Paper>
      </Popover>
    </>
  );
};
