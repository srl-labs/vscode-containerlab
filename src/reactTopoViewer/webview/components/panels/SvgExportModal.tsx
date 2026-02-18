// SVG export dialog.
import React, { useState, useCallback } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  AccountTree as AccountTreeIcon,
  Download as DownloadIcon,
  Lightbulb as LightbulbIcon
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControlLabel,
  InputAdornment,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography
} from "@mui/material";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import { EXPORT_COMMANDS } from "../../../shared/messages/extension";
import { MSG_SVG_EXPORT_RESULT } from "../../../shared/messages/webview";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";
import { sendCommandToExtension } from "../../messaging/extensionMessaging";
import { subscribeToWebviewMessages } from "../../messaging/webviewMessageBus";
import { log } from "../../utils/logger";
import { ColorField, PREVIEW_GRID_BG_SX } from "../ui/form";
import { DialogTitleWithClose } from "../ui/dialog/DialogChrome";

import {
  applyPadding,
  buildGraphSvg,
  collectGrafanaEdgeCellMappings,
  sanitizeSvgForGrafana,
  applyGrafanaCellIdsToSvg,
  buildGrafanaPanelYaml,
  buildGrafanaDashboardJson,
  getViewportSize,
  compositeAnnotationsIntoSvg,
  addBackgroundRect
} from "./svg-export";
import type { CustomIconMap } from "./svg-export";

export interface SvgExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
  groups?: GroupStyleAnnotation[];
  rfInstance: ReactFlowInstance | null;
  customIcons?: CustomIconMap;
}

const ANNOTATION_NODE_TYPES: Set<string> = new Set([
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
]);

function downloadSvg(content: string, filename: string): void {
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type BackgroundOption = "transparent" | "custom";

interface SvgExportResultMessage {
  type: typeof MSG_SVG_EXPORT_RESULT;
  requestId: string;
  success: boolean;
  error?: string;
  files?: string[];
}

interface GrafanaBundlePayload {
  requestId: string;
  baseName: string;
  svgContent: string;
  dashboardJson: string;
  panelYaml: string;
}

function createRequestId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `svg-export-${Date.now()}-${random}`;
}

function requestGrafanaBundleExport(payload: GrafanaBundlePayload): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {
      /* no-op until subscription is active */
    };

    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for export confirmation"));
    }, 30_000);

    unsubscribe = subscribeToWebviewMessages((event) => {
      const message = event.data as SvgExportResultMessage | undefined;
      if (!message || message.type !== MSG_SVG_EXPORT_RESULT) return;
      if (message.requestId !== payload.requestId) return;

      unsubscribe();
      window.clearTimeout(timeoutId);

      if (!message.success) {
        reject(new Error(message.error || "Grafana bundle export failed"));
        return;
      }

      const files = Array.isArray(message.files)
        ? message.files.filter((file): file is string => typeof file === "string")
        : [];
      resolve(files);
    });

    sendCommandToExtension(
      EXPORT_COMMANDS.EXPORT_SVG_GRAFANA_BUNDLE,
      payload as unknown as Record<string, unknown>
    );
  });
}

export const SvgExportModal: React.FC<SvgExportModalProps> = ({
  isOpen,
  onClose,
  textAnnotations = [],
  shapeAnnotations = [],
  groups = [],
  rfInstance,
  customIcons
}) => {
  const [borderZoom, setBorderZoom] = useState(100);
  const [borderPadding, setBorderPadding] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeEdgeLabels, setIncludeEdgeLabels] = useState(true);
  const [exportGrafanaBundle, setExportGrafanaBundle] = useState(false);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>("transparent");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#1e1e1e");
  const [filename, setFilename] = useState("topology");

  const isExportAvailable = rfInstance ? Boolean(getViewportSize()) : false;
  const totalAnnotations = groups.length + textAnnotations.length + shapeAnnotations.length;

  const handleExport = useCallback(async () => {
    if (!isExportAvailable || !rfInstance) {
      setExportStatus({ type: "error", message: "SVG export is not yet available" });
      return;
    }
    setIsExporting(true);
    setExportStatus(null);
    try {
      log.info(`[SvgExport] Export requested: zoom=${borderZoom}%, padding=${borderPadding}px`);
      const graphSvg = buildGraphSvg(
        rfInstance,
        borderZoom,
        customIcons,
        includeEdgeLabels,
        ANNOTATION_NODE_TYPES
      );
      if (!graphSvg) throw new Error("Unable to capture viewport for SVG export");
      let finalSvg = graphSvg.svg;
      if (borderPadding > 0) finalSvg = applyPadding(finalSvg, borderPadding);
      if (includeAnnotations && totalAnnotations > 0) {
        finalSvg = compositeAnnotationsIntoSvg(
          finalSvg,
          { groups, textAnnotations, shapeAnnotations },
          borderZoom / 100
        );
      }
      if (backgroundOption === "custom") {
        finalSvg = addBackgroundRect(finalSvg, customBackgroundColor);
      }

      const baseName = (filename || "topology").trim() || "topology";
      if (!exportGrafanaBundle) {
        downloadSvg(finalSvg, `${baseName}.svg`);
        setExportStatus({ type: "success", message: "SVG exported successfully" });
        return;
      }

      const mappings = collectGrafanaEdgeCellMappings(
        graphSvg.edges,
        graphSvg.nodes,
        ANNOTATION_NODE_TYPES
      );
      const grafanaBaseSvg = sanitizeSvgForGrafana(finalSvg);
      const grafanaSvg = applyGrafanaCellIdsToSvg(grafanaBaseSvg, mappings);
      const panelYaml = buildGrafanaPanelYaml(mappings);
      const dashboardJson = buildGrafanaDashboardJson(panelYaml, grafanaSvg, baseName);

      const requestId = createRequestId();
      const files = await requestGrafanaBundleExport({
        requestId,
        baseName,
        svgContent: grafanaSvg,
        dashboardJson,
        panelYaml
      });

      const suffix =
        files.length > 0 ? ` (${files.map((file) => file.split("/").pop()).join(", ")})` : "";
      setExportStatus({
        type: "success",
        message: `Grafana bundle exported successfully${suffix}`
      });
    } catch (error) {
      log.error(`[SvgExport] Export failed: ${error}`);
      setExportStatus({ type: "error", message: `Export failed: ${error}` });
    } finally {
      setIsExporting(false);
    }
  }, [
    isExportAvailable,
    borderZoom,
    borderPadding,
    includeAnnotations,
    includeEdgeLabels,
    exportGrafanaBundle,
    totalAnnotations,
    groups,
    textAnnotations,
    shapeAnnotations,
    backgroundOption,
    customBackgroundColor,
    filename,
    rfInstance,
    customIcons
  ]);

  const previewBackgroundSx = (() => {
    if (backgroundOption === "transparent") {
      return {
        backgroundImage:
          "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
      } as const;
    }
    return { backgroundColor: customBackgroundColor } as const;
  })();

  let exportButtonLabel = "Export SVG";
  if (isExporting) {
    exportButtonLabel = "Exporting...";
  } else if (exportGrafanaBundle) {
    exportButtonLabel = "Export Grafana Bundle";
  }

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth data-testid="svg-export-modal">
      <DialogTitleWithClose title="Export SVG" onClose={onClose} />
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2 }}>
          <TextField
            label="Filename"
            size="small"
            fullWidth
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="topology"
            data-testid="svg-export-filename"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Typography variant="caption" color="text.secondary">
                      .svg
                    </Typography>
                  </InputAdornment>
                )
              }
            }}
          />
        </Box>

        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">Quality & Size</Typography>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <TextField
              label="Zoom"
              type="number"
              size="small"
              value={borderZoom}
              onChange={(e) =>
                setBorderZoom(Math.max(10, Math.min(300, parseFloat(e.target.value) || 0)))
              }
              slotProps={{
                htmlInput: { min: 10, max: 300, step: 1 },
                input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }
              }}
            />
            <TextField
              label="Padding"
              type="number"
              size="small"
              value={borderPadding}
              onChange={(e) => setBorderPadding(Math.max(0, parseFloat(e.target.value) || 0))}
              slotProps={{
                htmlInput: { min: 0, max: 500, step: 1 },
                input: { endAdornment: <InputAdornment position="end">px</InputAdornment> }
              }}
            />
          </Box>
        </Box>

        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">Background</Typography>
        </Box>
        <Divider />
        <Box sx={{ display: "flex", flexDirection: "column", px: 2, py: 1 }}>
          <RadioGroup
            value={backgroundOption}
            onChange={(e) => setBackgroundOption(e.target.value as BackgroundOption)}
          >
            <FormControlLabel
              value="transparent"
              control={<Radio size="small" />}
              label="Transparent"
            />
            <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom" />
          </RadioGroup>
          {backgroundOption === "custom" && (
            <Box sx={{ pl: 4, pt: 1 }}>
              <ColorField
                label="Color"
                value={customBackgroundColor}
                onChange={setCustomBackgroundColor}
              />
            </Box>
          )}
        </Box>

        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">Include</Typography>
        </Box>
        <Divider />
        <Box sx={{ display: "flex", flexDirection: "column", px: 2, py: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeAnnotations}
                onChange={(e) => setIncludeAnnotations(e.target.checked)}
              />
            }
            label="Annotations"
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeEdgeLabels}
                onChange={(e) => setIncludeEdgeLabels(e.target.checked)}
              />
            }
            label="Edge labels"
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={exportGrafanaBundle}
                onChange={(e) => setExportGrafanaBundle(e.target.checked)}
              />
            }
            label="Grafana bundle (SVG + dashboard JSON + panel YAML)"
            data-testid="svg-export-grafana-bundle"
          />
        </Box>

        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">Preview</Typography>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              position: "relative",
              p: 2,
              borderRadius: 1,
              overflow: "hidden",
              border: 1,
              borderColor: "divider"
            }}
          >
            <Box sx={{ position: "absolute", inset: 0, opacity: 0.3, ...PREVIEW_GRID_BG_SX }} />
            <Box
              sx={{
                position: "relative",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Box
                sx={{
                  width: 96,
                  height: 64,
                  borderRadius: 1,
                  boxShadow: 3,
                  border: 1,
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 200ms",
                  ...previewBackgroundSx,
                  padding: `${Math.min(borderPadding / 20, 8)}px`,
                  transform: `scale(${0.8 + borderZoom / 500})`
                }}
              >
                <AccountTreeIcon sx={{ fontSize: 24, color: "primary.main", opacity: 0.8 }} />
              </Box>
            </Box>
          </Box>
        </Box>

        <Divider />
        <Box sx={{ p: 2 }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <LightbulbIcon sx={{ fontSize: 14, color: "warning.main" }} />
              <Typography variant="caption" color="text.secondary">
                Tips
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              component="ul"
              sx={{ pl: 2, m: 0, "& li": { mb: 0.25 } }}
            >
              <li>Higher zoom = better quality, larger file</li>
              <li>SVG files scale without quality loss</li>
              <li>Transparent background for layering</li>
            </Typography>
          </Paper>
        </Box>

        {exportStatus && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Alert severity={exportStatus.type === "success" ? "success" : "error"}>
              {exportStatus.message}
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          fullWidth
          onClick={() => void handleExport()}
          disabled={isExporting || !isExportAvailable}
          startIcon={
            isExporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />
          }
          data-testid="svg-export-btn"
        >
          {exportButtonLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
