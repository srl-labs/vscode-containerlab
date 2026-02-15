// SVG export dialog.
import React, { useState, useCallback } from "react";
import type { ReactFlowInstance, Edge } from "@xyflow/react";
import {
  AccountTree as AccountTreeIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Lightbulb as LightbulbIcon
} from "@mui/icons-material";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";
import { log } from "../../utils/logger";
import { ColorField, PREVIEW_GRID_BG_SX } from "../ui/form";

import {
  buildSvgDefs,
  renderNodesToSvg,
  renderEdgesToSvg,
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

function getViewportSize(): { width: number; height: number } | null {
  const container = document.querySelector(".react-flow") as HTMLElement | null;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  return { width: rect.width, height: rect.height };
}

function buildViewportTransform(
  viewport: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
  zoomPercent: number
) {
  const scaleFactor = Math.max(0.1, zoomPercent / 100);
  const width = Math.max(1, Math.round(size.width * scaleFactor));
  const height = Math.max(1, Math.round(size.height * scaleFactor));
  const transform = `translate(${viewport.x * scaleFactor}, ${viewport.y * scaleFactor}) scale(${viewport.zoom * scaleFactor})`;
  return { width, height, transform, scaleFactor };
}

function buildGraphSvg(
  rfInstance: ReactFlowInstance,
  zoomPercent: number,
  customIcons?: CustomIconMap,
  includeEdgeLabels?: boolean
) {
  const viewport = rfInstance.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const size = getViewportSize();
  if (!size) return null;
  const { width, height, transform } = buildViewportTransform(viewport, size, zoomPercent);
  const nodes = rfInstance.getNodes?.() ?? [];
  const edges = rfInstance.getEdges?.() ?? [];
  const edgesSvg = renderEdgesToSvg(
    edges as Edge[],
    nodes,
    includeEdgeLabels ?? true,
    ANNOTATION_NODE_TYPES
  );
  const nodesSvg = renderNodesToSvg(nodes, customIcons, ANNOTATION_NODE_TYPES);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += buildSvgDefs();
  svg += `<g transform="${transform}">`;
  svg += edgesSvg;
  svg += nodesSvg;
  svg += `</g></svg>`;
  return { svg, transform };
}

function applyPadding(svgContent: string, padding: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.documentElement;
  const width = parseFloat(svgEl.getAttribute("width") || "0");
  const height = parseFloat(svgEl.getAttribute("height") || "0");
  const newWidth = width + 2 * padding;
  const newHeight = height + 2 * padding;
  let viewBox = svgEl.getAttribute("viewBox") || `0 0 ${width} ${height}`;
  const [x, y, vWidth, vHeight] = viewBox.split(" ").map(parseFloat);
  const paddingX = padding * (vWidth / width);
  const paddingY = padding * (vHeight / height);
  svgEl.setAttribute(
    "viewBox",
    `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`
  );
  svgEl.setAttribute("width", newWidth.toString());
  svgEl.setAttribute("height", newHeight.toString());
  return new XMLSerializer().serializeToString(svgEl);
}

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
      const graphSvg = buildGraphSvg(rfInstance, borderZoom, customIcons, includeEdgeLabels);
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
      downloadSvg(finalSvg, `${filename || "topology"}.svg`);
      setExportStatus({ type: "success", message: "SVG exported successfully" });
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

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth data-testid="svg-export-modal">
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
      >
        Export SVG
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
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
          variant="contained"
          fullWidth
          onClick={() => void handleExport()}
          disabled={isExporting || !isExportAvailable}
          startIcon={
            isExporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />
          }
          data-testid="svg-export-btn"
        >
          {isExporting ? "Exporting..." : "Export SVG"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
