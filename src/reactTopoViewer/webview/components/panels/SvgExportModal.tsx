/**
 * SvgExportModal - MUI Dialog wrapper for SVG export
 * Extracts the content from SvgExportPanel into a Dialog.
 */
import React, { useState, useCallback } from "react";
import type { ReactFlowInstance, Edge } from "@xyflow/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import GridOnIcon from "@mui/icons-material/GridOn";
import PaletteIcon from "@mui/icons-material/Palette";
import DownloadIcon from "@mui/icons-material/Download";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import AccountTreeIcon from "@mui/icons-material/AccountTree";

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
import { Toggle, ColorSwatch, NumberInput, PREVIEW_GRID_BG } from "../ui/form";

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

const ANNOTATION_NODE_TYPES: Set<string> = new Set([FREE_TEXT_NODE_TYPE, FREE_SHAPE_NODE_TYPE, GROUP_NODE_TYPE]);

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

function buildGraphSvg(rfInstance: ReactFlowInstance, zoomPercent: number, customIcons?: CustomIconMap, includeEdgeLabels?: boolean) {
  const viewport = rfInstance.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const size = getViewportSize();
  if (!size) return null;
  const { width, height, transform } = buildViewportTransform(viewport, size, zoomPercent);
  const nodes = rfInstance.getNodes?.() ?? [];
  const edges = rfInstance.getEdges?.() ?? [];
  const edgesSvg = renderEdgesToSvg(edges as Edge[], nodes, includeEdgeLabels ?? true, ANNOTATION_NODE_TYPES);
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
  svgEl.setAttribute("viewBox", `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`);
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

type BackgroundOption = "transparent" | "white" | "custom";

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="subtitle2" fontWeight={600}>{children}</Typography>
);

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
  const [exportStatus, setExportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeEdgeLabels, setIncludeEdgeLabels] = useState(true);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>("transparent");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#1e1e1e");
  const [filename, setFilename] = useState("topology");

  const isExportAvailable = rfInstance ? Boolean(getViewportSize()) : false;
  const annotationCounts = { groups: groups.length, text: textAnnotations.length, shapes: shapeAnnotations.length };
  const totalAnnotations = annotationCounts.groups + annotationCounts.text + annotationCounts.shapes;

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
        finalSvg = compositeAnnotationsIntoSvg(finalSvg, { groups, textAnnotations, shapeAnnotations }, borderZoom / 100);
      }
      if (backgroundOption !== "transparent") {
        const bgColor = backgroundOption === "white" ? "#ffffff" : customBackgroundColor;
        finalSvg = addBackgroundRect(finalSvg, bgColor);
      }
      downloadSvg(finalSvg, `${filename || "topology"}.svg`);
      setExportStatus({ type: "success", message: "SVG exported successfully" });
    } catch (error) {
      log.error(`[SvgExport] Export failed: ${error}`);
      setExportStatus({ type: "error", message: `Export failed: ${error}` });
    } finally {
      setIsExporting(false);
    }
  }, [isExportAvailable, borderZoom, borderPadding, includeAnnotations, includeEdgeLabels, totalAnnotations, groups, textAnnotations, shapeAnnotations, backgroundOption, customBackgroundColor, filename, rfInstance, customIcons]);

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
        Export SVG
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <div className="flex flex-col gap-4">
          {/* Quality section */}
          <div className="flex flex-col gap-3">
            <SectionHeader>Quality & Size</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Zoom" value={borderZoom} onChange={(v) => setBorderZoom(Math.max(10, Math.min(300, v)))} min={10} max={300} unit="%" />
              <NumberInput label="Padding" value={borderPadding} onChange={(v) => setBorderPadding(Math.max(0, v))} min={0} max={500} unit="px" />
            </div>
          </div>

          {/* Background section */}
          <div className="flex flex-col gap-3">
            <SectionHeader>Background</SectionHeader>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex gap-2 pt-4">
                <Toggle active={backgroundOption === "transparent"} onClick={() => setBackgroundOption("transparent")}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><GridOnIcon sx={{ fontSize: 14 }} />Transparent</Box>
                </Toggle>
                <Toggle active={backgroundOption === "white"} onClick={() => setBackgroundOption("white")}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <span className="inline-block w-3 h-3 bg-white rounded-sm border border-[var(--vscode-panel-border)]" />White
                  </Box>
                </Toggle>
                <Toggle active={backgroundOption === "custom"} onClick={() => setBackgroundOption("custom")}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><PaletteIcon sx={{ fontSize: 14 }} />Custom</Box>
                </Toggle>
              </div>
              {backgroundOption === "custom" && <ColorSwatch label="Color" value={customBackgroundColor} onChange={setCustomBackgroundColor} />}
            </div>
          </div>

          {/* Annotations section */}
          <div className="flex flex-col gap-3">
            <SectionHeader>Annotations</SectionHeader>
            <div className="flex items-center justify-between p-3 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)]">
              <div className="flex flex-col">
                <span className="text-sm text-[var(--vscode-foreground)]">
                  {totalAnnotations > 0 ? `${totalAnnotations} annotation${totalAnnotations !== 1 ? "s" : ""}` : "No annotations"}
                </span>
              </div>
              <Toggle active={includeAnnotations} onClick={() => setIncludeAnnotations(!includeAnnotations)}>
                {includeAnnotations ? "Included" : "Excluded"}
              </Toggle>
            </div>
          </div>

          {/* Edge Labels */}
          <div className="flex flex-col gap-3">
            <SectionHeader>Edge Labels</SectionHeader>
            <div className="flex items-center justify-between p-3 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)]">
              <span className="text-sm text-[var(--vscode-foreground)]">Interface labels</span>
              <Toggle active={includeEdgeLabels} onClick={() => setIncludeEdgeLabels(!includeEdgeLabels)}>
                {includeEdgeLabels ? "Included" : "Excluded"}
              </Toggle>
            </div>
          </div>

          {/* Filename */}
          <div className="flex flex-col gap-1">
            <SectionHeader>Filename</SectionHeader>
            <TextField
              size="small"
              fullWidth
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="topology"
              InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">.svg</Typography></InputAdornment> }}
              sx={{ "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
            />
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-1">
            <SectionHeader>Preview</SectionHeader>
            <div className="relative p-4 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)] overflow-hidden">
              <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-30`} />
              <div className="relative z-10 flex items-center justify-center">
                <div
                  className="w-24 h-16 rounded-sm shadow-lg border border-[var(--vscode-panel-border)] flex items-center justify-center transition-all duration-200"
                  style={{
                    ...(backgroundOption === "transparent"
                      ? {
                          backgroundImage: "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)",
                          backgroundSize: "8px 8px",
                          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
                        }
                      : { backgroundColor: backgroundOption === "white" ? "#ffffff" : customBackgroundColor }),
                    padding: `${Math.min(borderPadding / 20, 8)}px`,
                    transform: `scale(${0.8 + borderZoom / 500})`
                  }}
                >
                  <AccountTreeIcon sx={{ fontSize: 24, color: "primary.main", opacity: 0.8 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Export button */}
          <Button
            variant="contained"
            fullWidth
            onClick={() => void handleExport()}
            disabled={isExporting || !isExportAvailable}
            startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          >
            {isExporting ? "Exporting..." : "Export SVG"}
          </Button>

          {exportStatus && (
            <Alert severity={exportStatus.type === "success" ? "success" : "error"}>
              {exportStatus.message}
            </Alert>
          )}

          {/* Tips */}
          <Box sx={{ p: 1.5, bgcolor: "var(--vscode-input-background)", borderRadius: 0.5, border: 1, borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <LightbulbIcon sx={{ fontSize: 14, color: "warning.main" }} />
              <Typography variant="caption" color="text.secondary">Tips</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" component="ul" sx={{ pl: 2, m: 0, "& li": { mb: 0.25 } }}>
              <li>Higher zoom = better quality, larger file</li>
              <li>SVG files scale without quality loss</li>
              <li>Transparent background for layering</li>
            </Typography>
          </Box>
        </div>
      </DialogContent>
    </Dialog>
  );
};
