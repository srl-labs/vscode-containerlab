/**
 * SvgExportPanel - Configure and export topology as SVG
 * Modern, sleek design matching other annotation editors
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
import { BasePanel } from "../ui/editor/BasePanel";
import { Toggle, ColorSwatch, NumberInput, PREVIEW_GRID_BG } from "../ui/form";

import {
  buildSvgDefs,
  renderNodesToSvg,
  renderEdgesToSvg,
  compositeAnnotationsIntoSvg,
  addBackgroundRect
} from "./svg-export";
import type { CustomIconMap } from "./svg-export";

export interface SvgExportPanelProps {
  isVisible: boolean;
  onClose: () => void;
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
  groups?: GroupStyleAnnotation[];
  rfInstance: ReactFlowInstance | null;
  /** Custom icons map for node rendering (icon name -> data URI) */
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
): { width: number; height: number; transform: string; scaleFactor: number } {
  const scaleFactor = Math.max(0.1, zoomPercent / 100);
  const width = Math.max(1, Math.round(size.width * scaleFactor));
  const height = Math.max(1, Math.round(size.height * scaleFactor));
  const transform = `translate(${viewport.x * scaleFactor}, ${viewport.y * scaleFactor}) scale(${
    viewport.zoom * scaleFactor
  })`;

  return { width, height, transform, scaleFactor };
}

/**
 * Build the complete graph SVG using new rendering modules
 */
function buildGraphSvg(
  rfInstance: ReactFlowInstance,
  zoomPercent: number,
  customIcons?: CustomIconMap,
  includeEdgeLabels?: boolean
): { svg: string; transform: string } | null {
  const viewport = rfInstance.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const size = getViewportSize();
  if (!size) return null;

  const { width, height, transform } = buildViewportTransform(viewport, size, zoomPercent);

  const nodes = rfInstance.getNodes?.() ?? [];
  const edges = rfInstance.getEdges?.() ?? [];

  // Render edges first (underneath nodes), then nodes
  const edgesSvg = renderEdgesToSvg(edges as Edge[], nodes, includeEdgeLabels ?? true, ANNOTATION_NODE_TYPES);
  const nodesSvg = renderNodesToSvg(nodes, customIcons, ANNOTATION_NODE_TYPES);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  // Add defs section with filters (text shadow, etc.)
  svg += buildSvgDefs();
  svg += `<g transform="${transform}">`;
  svg += edgesSvg;
  svg += nodesSvg;
  svg += `</g></svg>`;

  return { svg, transform };
}

/** Apply padding to SVG content */
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
  const newViewBox = `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`;

  svgEl.setAttribute("viewBox", newViewBox);
  svgEl.setAttribute("width", newWidth.toString());
  svgEl.setAttribute("height", newHeight.toString());

  return new XMLSerializer().serializeToString(svgEl);
}

/** Trigger file download */
function downloadSvg(content: string, filename: string): void {
  const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Check if SVG export is available */
function isSvgExportAvailable(rfInstance: ReactFlowInstance | null): boolean {
  if (!rfInstance) return false;
  return Boolean(getViewportSize());
}

type BackgroundOption = "transparent" | "white" | "custom";

// Section header component
const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="subtitle2" fontWeight={600}>
    {children}
  </Typography>
);

// Quality section
const QualitySection: React.FC<{
  zoom: number;
  setZoom: (v: number) => void;
  padding: number;
  setPadding: (v: number) => void;
}> = ({ zoom, setZoom, padding, setPadding }) => (
  <div className="flex flex-col gap-3">
    <SectionHeader>Quality & Size</SectionHeader>
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        label="Zoom"
        value={zoom}
        onChange={(v) => setZoom(Math.max(10, Math.min(300, v)))}
        min={10}
        max={300}
        unit="%"
      />
      <NumberInput
        label="Padding"
        value={padding}
        onChange={(v) => setPadding(Math.max(0, v))}
        min={0}
        max={500}
        unit="px"
      />
    </div>
  </div>
);

// Background section
const BackgroundSection: React.FC<{
  option: BackgroundOption;
  setOption: (v: BackgroundOption) => void;
  customColor: string;
  setCustomColor: (v: string) => void;
}> = ({ option, setOption, customColor, setCustomColor }) => (
  <div className="flex flex-col gap-3">
    <SectionHeader>Background</SectionHeader>
    <div className="flex items-start gap-3 flex-wrap">
      <div className="flex gap-2 pt-4">
        <Toggle active={option === "transparent"} onClick={() => setOption("transparent")}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <GridOnIcon sx={{ fontSize: 14 }} />
            Transparent
          </Box>
        </Toggle>
        <Toggle active={option === "white"} onClick={() => setOption("white")}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <span className="inline-block w-3 h-3 bg-white rounded-sm border border-[var(--vscode-panel-border)]" />
            White
          </Box>
        </Toggle>
        <Toggle active={option === "custom"} onClick={() => setOption("custom")}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <PaletteIcon sx={{ fontSize: 14 }} />
            Custom
          </Box>
        </Toggle>
      </div>
      {option === "custom" && (
        <ColorSwatch label="Color" value={customColor} onChange={setCustomColor} />
      )}
    </div>
  </div>
);

// Annotations section
const AnnotationsSection: React.FC<{
  include: boolean;
  setInclude: (v: boolean) => void;
  counts: { groups: number; text: number; shapes: number };
}> = ({ include, setInclude, counts }) => {
  const total = counts.groups + counts.text + counts.shapes;
  const hasAny = total > 0;
  const pluralSuffix = total !== 1 ? "s" : "";
  const annotationLabel = hasAny ? `${total} annotation${pluralSuffix}` : "No annotations";

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader>Annotations</SectionHeader>
      <div className="flex items-center justify-between p-3 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)]">
        <div className="flex flex-col">
          <span className="text-sm text-[var(--vscode-foreground)]">{annotationLabel}</span>
          {hasAny && (
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {[
                counts.groups > 0 && `${counts.groups} group${counts.groups !== 1 ? "s" : ""}`,
                counts.text > 0 && `${counts.text} text`,
                counts.shapes > 0 && `${counts.shapes} shape${counts.shapes !== 1 ? "s" : ""}`
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          )}
        </div>
        <Toggle active={include} onClick={() => setInclude(!include)}>
          {include ? "Included" : "Excluded"}
        </Toggle>
      </div>
    </div>
  );
};

// Edge Labels section
const EdgeLabelsSection: React.FC<{
  include: boolean;
  setInclude: (v: boolean) => void;
}> = ({ include, setInclude }) => (
  <div className="flex flex-col gap-3">
    <SectionHeader>Edge Labels</SectionHeader>
    <div className="flex items-center justify-between p-3 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)]">
      <div className="flex flex-col">
        <span className="text-sm text-[var(--vscode-foreground)]">Interface labels</span>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          Endpoint labels (e.g., e1-1, eth0)
        </span>
      </div>
      <Toggle active={include} onClick={() => setInclude(!include)}>
        {include ? "Included" : "Excluded"}
      </Toggle>
    </div>
  </div>
);

// Filename section
const FilenameSection: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-1">
    <SectionHeader>Filename</SectionHeader>
    <TextField
      size="small"
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="topology"
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Typography variant="caption" color="text.secondary">
              .svg
            </Typography>
          </InputAdornment>
        )
      }}
      sx={{ "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
    />
  </div>
);

// Preview section
const PreviewSection: React.FC<{
  zoom: number;
  padding: number;
  background: BackgroundOption;
  customColor: string;
  includeAnnotations: boolean;
  annotationCount: number;
}> = ({ zoom, padding, background, customColor, includeAnnotations, annotationCount }) => {
  const bgStyle =
    background === "transparent"
      ? {
          backgroundImage:
            "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
        }
      : { backgroundColor: background === "white" ? "#ffffff" : customColor };

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader>Preview</SectionHeader>
      <div className="relative p-4 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)] overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-30`} />
        <div className="relative z-10 flex items-center justify-center">
          <div
            className="w-24 h-16 rounded-sm shadow-lg border border-[var(--vscode-panel-border)] flex items-center justify-center transition-all duration-200"
            style={{
              ...bgStyle,
              padding: `${Math.min(padding / 20, 8)}px`,
              transform: `scale(${0.8 + zoom / 500})`
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <AccountTreeIcon sx={{ fontSize: 24, color: "primary.main", opacity: 0.8 }} />
              {includeAnnotations && annotationCount > 0 && (
                <span className="text-[8px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded-sm">
                  +{annotationCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tips section
const TipsSection: React.FC = () => (
  <Box
    sx={{
      p: 1.5,
      bgcolor: "var(--vscode-input-background)",
      borderRadius: 0.5,
      border: 1,
      borderColor: "divider"
    }}
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
      <LightbulbIcon sx={{ fontSize: 14, color: "warning.main" }} />
      <Typography variant="caption" color="text.secondary">
        Tips
      </Typography>
    </Box>
    <Typography variant="caption" color="text.secondary" component="ul" sx={{ pl: 2, m: 0, "& li": { mb: 0.25 } }}>
      <li>Higher zoom = better quality, larger file</li>
      <li>SVG files scale without quality loss</li>
      <li>Transparent background for layering</li>
    </Typography>
  </Box>
);

export const SvgExportPanel: React.FC<SvgExportPanelProps> = ({
  isVisible,
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

  const isExportAvailable = isSvgExportAvailable(rfInstance);

  const annotationCounts = {
    groups: groups.length,
    text: textAnnotations.length,
    shapes: shapeAnnotations.length
  };
  const totalAnnotations =
    annotationCounts.groups + annotationCounts.text + annotationCounts.shapes;

  const handleExport = useCallback(async () => {
    if (!isExportAvailable) {
      setExportStatus({ type: "error", message: "SVG export is not yet available" });
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      log.info(`[SvgExport] Export requested: zoom=${borderZoom}%, padding=${borderPadding}px`);

      if (!rfInstance) {
        throw new Error("React Flow instance not available");
      }

      const graphSvg = buildGraphSvg(rfInstance, borderZoom, customIcons, includeEdgeLabels);
      if (!graphSvg) {
        throw new Error("Unable to capture viewport for SVG export");
      }

      let finalSvg = graphSvg.svg;

      // Apply padding
      if (borderPadding > 0) {
        finalSvg = applyPadding(finalSvg, borderPadding);
      }

      // Add annotations if enabled
      if (includeAnnotations && totalAnnotations > 0) {
        finalSvg = compositeAnnotationsIntoSvg(
          finalSvg,
          { groups, textAnnotations, shapeAnnotations },
          borderZoom / 100
        );
      }

      // Add background
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

  return (
    <BasePanel
      title="Export SVG"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 360, y: 72 }}
      width={340}
      storageKey="svgExport"
      zIndex={90}
      footer={false}
      minWidth={300}
      minHeight={200}
      testId="svg-export-panel"
    >
      <div className="flex flex-col gap-4">
        <QualitySection
          zoom={borderZoom}
          setZoom={setBorderZoom}
          padding={borderPadding}
          setPadding={setBorderPadding}
        />

        <BackgroundSection
          option={backgroundOption}
          setOption={setBackgroundOption}
          customColor={customBackgroundColor}
          setCustomColor={setCustomBackgroundColor}
        />

        <AnnotationsSection
          include={includeAnnotations}
          setInclude={setIncludeAnnotations}
          counts={annotationCounts}
        />

        <EdgeLabelsSection
          include={includeEdgeLabels}
          setInclude={setIncludeEdgeLabels}
        />

        <FilenameSection value={filename} onChange={setFilename} />

        <PreviewSection
          zoom={borderZoom}
          padding={borderPadding}
          background={backgroundOption}
          customColor={customBackgroundColor}
          includeAnnotations={includeAnnotations}
          annotationCount={totalAnnotations}
        />

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

        {/* Status message */}
        {exportStatus && (
          <Alert severity={exportStatus.type === "success" ? "success" : "error"}>
            {exportStatus.message}
          </Alert>
        )}

        <TipsSection />
      </div>
    </BasePanel>
  );
};
