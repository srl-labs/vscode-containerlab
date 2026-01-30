/**
 * SvgExportPanel - Configure and export topology as SVG
 * Modern, sleek design matching other annotation editors
 */
import React, { useState, useCallback } from "react";
import type { ReactFlowInstance, Node, Edge } from "@xyflow/react";

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
import type { NodeType } from "../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../icons/SvgGenerator";
import { log } from "../../utils/logger";
import { BasePanel } from "../ui/editor/BasePanel";
import { Toggle, ColorSwatch, NumberInput, PREVIEW_GRID_BG } from "../ui/form";

import { compositeAnnotationsIntoSvg, addBackgroundRect } from "./svg-export/annotationsToSvg";
export interface SvgExportPanelProps {
  isVisible: boolean;
  onClose: () => void;
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
  groups?: GroupStyleAnnotation[];
  rfInstance: ReactFlowInstance | null;
}

const DEFAULT_NODE_SIZE = 60;
const DEFAULT_NODE_RADIUS = 6;

const ANNOTATION_NODE_TYPES: Set<string> = new Set([FREE_TEXT_NODE_TYPE, FREE_SHAPE_NODE_TYPE, GROUP_NODE_TYPE]);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getViewportSize(): { width: number; height: number } | null {
  const container = document.querySelector(".react-flow") as HTMLElement | null;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  return { width: rect.width, height: rect.height };
}

function getNodeSize(node: Node): { width: number; height: number } {
  const width =
    node.measured?.width ??
    node.width ??
    (typeof (node.data as Record<string, unknown>)?.width === "number"
      ? ((node.data as Record<string, unknown>).width as number)
      : undefined) ??
    DEFAULT_NODE_SIZE;
  const height =
    node.measured?.height ??
    node.height ??
    (typeof (node.data as Record<string, unknown>)?.height === "number"
      ? ((node.data as Record<string, unknown>).height as number)
      : undefined) ??
    DEFAULT_NODE_SIZE;
  return { width, height };
}

function buildGraphSvg(
  rfInstance: ReactFlowInstance,
  zoomPercent: number
): { svg: string; transform: string } | null {
  const viewport = rfInstance.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const size = getViewportSize();
  if (!size) return null;

  const scaleFactor = Math.max(0.1, zoomPercent / 100);
  const width = Math.max(1, Math.round(size.width * scaleFactor));
  const height = Math.max(1, Math.round(size.height * scaleFactor));
  const transform = `translate(${viewport.x * scaleFactor}, ${viewport.y * scaleFactor}) scale(${
    viewport.zoom * scaleFactor
  })`;

  const nodes = rfInstance.getNodes?.() ?? [];
  const edges = rfInstance.getEdges?.() ?? [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<g transform="${transform}">`;

  // Render edges (simple straight lines between node centers)
  for (const edge of edges as Edge[]) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    if (ANNOTATION_NODE_TYPES.has(source.type ?? "") || ANNOTATION_NODE_TYPES.has(target.type ?? "")) {
      continue;
    }

    const sourceSize = getNodeSize(source);
    const targetSize = getNodeSize(target);
    const x1 = source.position.x + sourceSize.width / 2;
    const y1 = source.position.y + sourceSize.height / 2;
    const x2 = target.position.x + targetSize.width / 2;
    const y2 = target.position.y + targetSize.height / 2;

    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" />`;
  }

  // Render nodes
  for (const node of nodes) {
    if (ANNOTATION_NODE_TYPES.has(node.type ?? "")) continue;
    const { width: nodeWidth, height: nodeHeight } = getNodeSize(node);
    const x = node.position.x;
    const y = node.position.y;
    const label = escapeXml(
      (node.data as Record<string, unknown> | undefined)?.label?.toString() ?? node.id
    );

    svg += `<g class="export-node" data-id="${escapeXml(node.id)}">`;
    svg += `<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${DEFAULT_NODE_RADIUS}" ry="${DEFAULT_NODE_RADIUS}" fill="#1f2937" stroke="#9ca3af" stroke-width="1" />`;
    svg += `<text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2}" font-size="12" fill="#e5e7eb" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    svg += `</g>`;
  }

  svg += `</g></svg>`;
  return { svg, transform };
}

/** Extract attribute from image element attributes string */
function getImageAttr(attrPart: string, name: string): string {
  const reg = new RegExp(`${name}="([^"]+)"`);
  const res = reg.exec(attrPart);
  return res ? res[1] : "";
}

/** Transform SVG content for proper sizing */
function transformSvgContent(
  svgContent: string,
  width: string,
  height: string,
  fillColor: string
): string {
  let result = svgContent;
  result = result.replace(/<svg([^>]*?)width="[^"]*"([^>]*?)>/i, "<svg$1$2>");
  result = result.replace(/<svg([^>]*?)height="[^"]*"([^>]*?)>/i, "<svg$1$2>");
  result = result.replace("<svg", `<svg width="${width}" height="${height}"`);

  result = result.replace(
    /<rect([^>]*?)class="st0"([^>]*?)\/>/g,
    (_m: string, before: string, after: string) => {
      const combined = before + after;
      const widthMatch = /width="([^"]*)"/.exec(combined);
      const heightMatch = /height="([^"]*)"/.exec(combined);
      return `<rect width="${widthMatch?.[1] ?? "120"}" height="${heightMatch?.[1] ?? "120"}" fill="${fillColor}" />`;
    }
  );

  result = result.replace(
    /class="st1"/g,
    'fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"'
  );
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
  return result;
}

/** Replace PNG image elements with SVG versions */
function replacePngWithSvg(svg: string): string {
  const imageRegex =
    /<image([^>]*?)(?:xlink:href|href)="data:image\/png[^"]*"[^>]*>(?:<\/image>)?/g;
  const fillColor = "#005aff";

  return svg.replace(imageRegex, (_match, attrPart) => {
    const transform = getImageAttr(attrPart, "transform") || "";
    const width = getImageAttr(attrPart, "width") || "14";
    const height = getImageAttr(attrPart, "height") || "14";

    const svgDataUri = generateEncodedSVG("pe" as NodeType, fillColor);
    const svgContent = decodeURIComponent(svgDataUri.replace("data:image/svg+xml;utf8,", ""));
    const transformed = transformSvgContent(svgContent, width, height, fillColor);

    return `<g transform="${transform}">${transformed}</g>`;
  });
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
  <h4 className="section-header">{children}</h4>
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
          <i className="fas fa-chess-board mr-1.5 text-[10px]" />
          Transparent
        </Toggle>
        <Toggle active={option === "white"} onClick={() => setOption("white")}>
          <span className="inline-block w-3 h-3 bg-white rounded-sm mr-1.5 border border-white/30" />
          White
        </Toggle>
        <Toggle active={option === "custom"} onClick={() => setOption("custom")}>
          <i className="fas fa-palette mr-1.5 text-[10px]" />
          Custom
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
      <div className="flex items-center justify-between p-3 bg-black/20 rounded-sm border border-white/5">
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

// Filename section
const FilenameSection: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-1">
    <SectionHeader>Filename</SectionHeader>
    <div className="flex items-center gap-1">
      <input
        type="text"
        className="flex-1 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs hover:border-white/20 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="topology"
      />
      <span className="text-xs text-[var(--vscode-descriptionForeground)] px-2">.svg</span>
    </div>
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
      <div className="relative p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-sm border border-white/5 overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-30`} />
        <div className="relative z-10 flex items-center justify-center">
          <div
            className="w-24 h-16 rounded-sm shadow-lg border border-white/10 flex items-center justify-center transition-all duration-200"
            style={{
              ...bgStyle,
              padding: `${Math.min(padding / 20, 8)}px`,
              transform: `scale(${0.8 + zoom / 500})`
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <i className="fas fa-project-diagram text-lg text-[var(--accent)] opacity-80" />
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
  <div className="flex flex-col gap-1.5 p-3 bg-black/10 rounded-sm border border-white/5">
    <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)]">
      <i className="fas fa-lightbulb text-yellow-400/70 text-xs" />
      <span className="field-label">Tips</span>
    </div>
    <ul className="helper-text space-y-1 ml-5">
      <li>Higher zoom = better quality, larger file</li>
      <li>SVG files scale without quality loss</li>
      <li>Transparent background for layering</li>
    </ul>
  </div>
);

export const SvgExportPanel: React.FC<SvgExportPanelProps> = ({
  isVisible,
  onClose,
  textAnnotations = [],
  shapeAnnotations = [],
  groups = [],
  rfInstance
}) => {
  const [borderZoom, setBorderZoom] = useState(100);
  const [borderPadding, setBorderPadding] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>("transparent");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#1e1e1e");
  const [filename, setFilename] = useState("topology");

  // SVG export is not yet implemented
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
      // Future implementation would:
      // 1. Generate SVG from ReactFlow using toObject()
      // 2. Apply zoom/padding settings
      // 3. Composite annotations if enabled
      // 4. Add background color if selected
      // 5. Download the result
      log.info(`[SvgExport] Export requested: zoom=${borderZoom}%, padding=${borderPadding}px`);

      if (!rfInstance) {
        throw new Error("React Flow instance not available");
      }

      const graphSvg = buildGraphSvg(rfInstance, borderZoom);
      if (!graphSvg) {
        throw new Error("Unable to capture viewport for SVG export");
      }

      let finalSvg = graphSvg.svg;

      // Apply padding
      if (borderPadding > 0) {
        finalSvg = applyPadding(finalSvg, borderPadding);
      }

      // Replace PNG icons with SVG
      finalSvg = replacePngWithSvg(finalSvg);

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
    totalAnnotations,
    groups,
    textAnnotations,
    shapeAnnotations,
    backgroundOption,
    customBackgroundColor,
    filename
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
        <button
          type="button"
          className={`w-full py-3 px-4 rounded-sm font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
            isExporting || !isExportAvailable
              ? "bg-white/5 text-[var(--vscode-descriptionForeground)] cursor-not-allowed"
              : "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 shadow-lg shadow-[var(--accent)]/20 hover:shadow-[var(--accent)]/30"
          }`}
          onClick={() => void handleExport()}
          disabled={isExporting || !isExportAvailable}
        >
          {isExporting ? (
            <>
              <i className="fas fa-circle-notch fa-spin" />
              Exporting...
            </>
          ) : (
            <>
              <i className="fas fa-download" />
              Export SVG
            </>
          )}
        </button>

        {/* Status message */}
        {exportStatus && (
          <div
            className={`flex items-center gap-2 p-3 rounded-sm text-sm ${
              exportStatus.type === "success"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            <i
              className={`fas ${exportStatus.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`}
            />
            {exportStatus.message}
          </div>
        )}

        <TipsSection />
      </div>
    </BasePanel>
  );
};
