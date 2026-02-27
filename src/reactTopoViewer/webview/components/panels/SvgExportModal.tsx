// SVG export dialog.
import React, { useState, useCallback, useMemo } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  AccountTree as AccountTreeIcon,
  Download as DownloadIcon,
  Lightbulb as LightbulbIcon,
  Settings as SettingsIcon
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
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Tab,
  Tabs,
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
  collectLinkedNodeIds,
  sanitizeSvgForGrafana,
  removeUnlinkedNodesFromSvg,
  trimGrafanaSvgToTopologyContent,
  addGrafanaTrafficLegend,
  makeGrafanaSvgResponsive,
  applyGrafanaCellIdsToSvg,
  buildGrafanaPanelYaml,
  buildGrafanaDashboardJson,
  DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS,
  getViewportSize,
  compositeAnnotationsIntoSvg,
  addBackgroundRect
} from "./svg-export";
import type {
  CustomIconMap,
  GrafanaTrafficThresholds,
  GraphSvgResult,
  GraphSvgRenderOptions
} from "./svg-export";

export interface SvgExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  labName?: string;
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
const DEFAULT_GRAFANA_NODE_SIZE_PX = 40;
const DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT = 100;
type TrafficThresholdUnit = "kbit" | "mbit" | "gbit";
const DEFAULT_TRAFFIC_THRESHOLD_UNIT: TrafficThresholdUnit = "mbit";
type GrafanaSettingsTab = "general" | "interface-names";

interface EdgeInterfaceRow {
  edgeId: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

const INTERFACE_SELECT_AUTO = "__auto__";
const INTERFACE_SELECT_FULL = "__full__";
const INTERFACE_SELECT_TOKEN_PREFIX = "__token__:";
const GLOBAL_INTERFACE_PART_INDEX_PREFIX = "__part-index__:";

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

interface PreparedSvgExport {
  baseName: string;
  finalSvg: string;
  graphSvg: GraphSvgResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createRequestId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `svg-export-${Date.now()}-${random}`;
}

function getThresholdUnitMultiplier(unit: TrafficThresholdUnit): number {
  switch (unit) {
    case "kbit":
      return 1_000;
    case "gbit":
      return 1_000_000_000;
    default:
      return 1_000_000;
  }
}

function formatThresholdForUnit(valueBps: number, unit: TrafficThresholdUnit): string {
  const multiplier = getThresholdUnitMultiplier(unit);
  if (!Number.isFinite(valueBps) || multiplier <= 0) return "0";
  const scaled = valueBps / multiplier;
  return Number(scaled.toFixed(4)).toString();
}

function parseThreshold(value: string, unit: TrafficThresholdUnit): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  const multiplier = getThresholdUnitMultiplier(unit);
  return Math.max(0, Math.round(parsed * multiplier));
}

function getThresholdUnitStep(unit: TrafficThresholdUnit): number {
  switch (unit) {
    case "kbit":
      return 1;
    case "gbit":
      return 0.01;
    default:
      return 0.1;
  }
}

function parseBoundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDefaultExportBaseName(labName?: string): string {
  const trimmed = labName?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : "topology";
}

function extractEdgeInterfaceRows(rfInstance: ReactFlowInstance | null): EdgeInterfaceRow[] {
  if (!rfInstance) return [];

  const edges = rfInstance.getEdges();
  const rows: EdgeInterfaceRow[] = [];

  for (const edge of edges) {
    const data = edge.data;
    const sourceEndpoint = asNonEmptyString(data?.sourceEndpoint);
    const targetEndpoint = asNonEmptyString(data?.targetEndpoint);
    if (sourceEndpoint === null || targetEndpoint === null) continue;

    rows.push({
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceEndpoint,
      targetEndpoint
    });
  }

  return rows;
}

function splitInterfaceParts(endpoint: string): string[] {
  const baseParts = endpoint
    .split(/[^A-Za-z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const uniqueParts: string[] = [];
  const seen = new Set<string>();
  const addUnique = (part: string): void => {
    if (seen.has(part)) return;
    seen.add(part);
    uniqueParts.push(part);
  };

  for (const part of baseParts) {
    addUnique(part);

    const numericSegments = part.match(/\d+/g);
    if (!numericSegments) continue;
    for (const numeric of numericSegments) {
      addUnique(numeric);
    }
  }

  return uniqueParts;
}

function getInterfaceSelectionValue(
  endpoint: string,
  interfaceLabelOverrides: Record<string, string>
): string {
  const override = interfaceLabelOverrides[endpoint];
  if (override.length === 0) return INTERFACE_SELECT_AUTO;
  if (override === endpoint) return INTERFACE_SELECT_FULL;
  return `${INTERFACE_SELECT_TOKEN_PREFIX}${override}`;
}

function parseBackgroundOption(value: string): BackgroundOption {
  return value === "custom" ? "custom" : "transparent";
}

function parseGrafanaSettingsTab(value: unknown): GrafanaSettingsTab {
  return value === "interface-names" ? "interface-names" : "general";
}

function parseTrafficThresholdUnit(value: string): TrafficThresholdUnit {
  if (value === "kbit" || value === "mbit" || value === "gbit") return value;
  return DEFAULT_TRAFFIC_THRESHOLD_UNIT;
}

function isSvgExportResultMessage(value: unknown): value is SvgExportResultMessage {
  if (!isRecord(value)) return false;
  if (value.type !== MSG_SVG_EXPORT_RESULT) return false;
  if (asNonEmptyString(value.requestId) === null) return false;
  if (typeof value.success !== "boolean") return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.files !== undefined && !Array.isArray(value.files)) return false;
  return true;
}

function resolveInterfaceOverrideValue(endpoint: string, selectedValue: string): string | null {
  if (selectedValue === INTERFACE_SELECT_AUTO) return null;
  if (selectedValue === INTERFACE_SELECT_FULL) return endpoint;
  if (selectedValue.startsWith(INTERFACE_SELECT_TOKEN_PREFIX)) {
    const token = selectedValue.slice(INTERFACE_SELECT_TOKEN_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

function parseGlobalInterfacePartIndex(selectedValue: string): number | null {
  if (!selectedValue.startsWith(GLOBAL_INTERFACE_PART_INDEX_PREFIX)) return null;
  const raw = selectedValue.slice(GLOBAL_INTERFACE_PART_INDEX_PREFIX.length);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

function resolveGlobalInterfaceOverrideValue(
  endpoint: string,
  selectedValue: string
): string | null {
  if (selectedValue === INTERFACE_SELECT_AUTO) return null;
  if (selectedValue === INTERFACE_SELECT_FULL) return endpoint;

  const partIndex = parseGlobalInterfacePartIndex(selectedValue);
  if (partIndex === null) return null;

  const parts = splitInterfaceParts(endpoint);
  return parts[partIndex - 1] ?? null;
}

function hasStrictlyAscendingThresholds(thresholds: GrafanaTrafficThresholds): boolean {
  return (
    thresholds.green < thresholds.yellow &&
    thresholds.yellow < thresholds.orange &&
    thresholds.orange < thresholds.red
  );
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
      const message = event.data;
      if (!isSvgExportResultMessage(message)) return;
      if (message.requestId !== payload.requestId) return;

      unsubscribe();
      window.clearTimeout(timeoutId);

      if (!message.success) {
        reject(new Error(message.error ?? "Grafana bundle export failed"));
        return;
      }

      const files = Array.isArray(message.files)
        ? message.files.filter((file): file is string => typeof file === "string")
        : [];
      resolve(files);
    });

    sendCommandToExtension(EXPORT_COMMANDS.EXPORT_SVG_GRAFANA_BUNDLE, {
      requestId: payload.requestId,
      baseName: payload.baseName,
      svgContent: payload.svgContent,
      dashboardJson: payload.dashboardJson,
      panelYaml: payload.panelYaml
    });
  });
}

export const SvgExportModal: React.FC<SvgExportModalProps> = ({
  isOpen,
  onClose,
  labName,
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
  const [grafanaSettingsTab, setGrafanaSettingsTab] = useState<GrafanaSettingsTab>("general");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeEdgeLabels, setIncludeEdgeLabels] = useState(true);
  const [exportGrafanaBundle, setExportGrafanaBundle] = useState(false);
  const [isGrafanaSettingsOpen, setIsGrafanaSettingsOpen] = useState(false);
  const [excludeNodesWithoutLinks, setExcludeNodesWithoutLinks] = useState(true);
  const [includeGrafanaLegend, setIncludeGrafanaLegend] = useState(false);
  const [trafficThresholds, setTrafficThresholds] = useState<GrafanaTrafficThresholds>({
    ...DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS
  });
  const [trafficThresholdUnit, setTrafficThresholdUnit] = useState<TrafficThresholdUnit>(
    DEFAULT_TRAFFIC_THRESHOLD_UNIT
  );
  const [grafanaNodeSizePx, setGrafanaNodeSizePx] = useState(DEFAULT_GRAFANA_NODE_SIZE_PX);
  const [grafanaInterfaceSizePercent, setGrafanaInterfaceSizePercent] = useState(
    DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT
  );
  const [globalInterfaceOverrideSelection, setGlobalInterfaceOverrideSelection] =
    useState(INTERFACE_SELECT_AUTO);
  const [interfaceLinkFilter, setInterfaceLinkFilter] = useState("");
  const [interfaceLabelOverrides, setInterfaceLabelOverrides] = useState<Record<string, string>>(
    {}
  );
  const [backgroundOption, setBackgroundOption] = useState<BackgroundOption>("transparent");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#1e1e1e");
  const defaultBaseName = useMemo(() => resolveDefaultExportBaseName(labName), [labName]);
  const [filename, setFilename] = useState(defaultBaseName);

  const isExportAvailable = rfInstance ? Boolean(getViewportSize()) : false;
  const totalAnnotations = groups.length + textAnnotations.length + shapeAnnotations.length;
  const interfaceRows = extractEdgeInterfaceRows(rfInstance);
  const filteredInterfaceRows = useMemo(() => {
    const filterValue = interfaceLinkFilter.trim().toLowerCase();
    if (!filterValue) return interfaceRows;

    return interfaceRows.filter((row) =>
      [row.edgeId, row.source, row.target, row.sourceEndpoint, row.targetEndpoint]
        .join(" ")
        .toLowerCase()
        .includes(filterValue)
    );
  }, [interfaceRows, interfaceLinkFilter]);
  const interfaceEndpoints = useMemo(() => {
    const unique = new Set<string>();
    for (const row of interfaceRows) {
      unique.add(row.sourceEndpoint);
      unique.add(row.targetEndpoint);
    }
    return Array.from(unique.values());
  }, [interfaceRows]);
  const maxInterfacePartCount = useMemo(() => {
    let maxCount = 1;
    for (const endpoint of interfaceEndpoints) {
      maxCount = Math.max(maxCount, splitInterfaceParts(endpoint).length);
    }
    return maxCount;
  }, [interfaceEndpoints]);
  const effectiveInterfaceLabelOverrides = useMemo(() => {
    const merged: Record<string, string> = {};

    for (const endpoint of interfaceEndpoints) {
      const globalOverride = resolveGlobalInterfaceOverrideValue(
        endpoint,
        globalInterfaceOverrideSelection
      );
      if (globalOverride !== null) {
        merged[endpoint] = globalOverride;
      }
    }

    for (const [endpoint, override] of Object.entries(interfaceLabelOverrides)) {
      if (typeof override !== "string" || override.trim().length === 0) {
        delete merged[endpoint];
      } else {
        merged[endpoint] = override.trim();
      }
    }

    return merged;
  }, [interfaceEndpoints, globalInterfaceOverrideSelection, interfaceLabelOverrides]);

  const updateTrafficThreshold = useCallback(
    (threshold: keyof GrafanaTrafficThresholds, rawValue: string) => {
      const nextValue = parseThreshold(rawValue, trafficThresholdUnit);
      setTrafficThresholds((prev) => ({
        ...prev,
        [threshold]: nextValue
      }));
    },
    [trafficThresholdUnit]
  );

  const updateInterfaceOverride = useCallback((endpoint: string, selectedValue: string) => {
    const override = resolveInterfaceOverrideValue(endpoint, selectedValue);
    setInterfaceLabelOverrides((prev) => {
      if (override === null) {
        if (!(endpoint in prev)) return prev;
        const next = { ...prev };
        delete next[endpoint];
        return next;
      }
      if (prev[endpoint] === override) return prev;
      return { ...prev, [endpoint]: override };
    });
  }, []);

  const prepareSvgExport = useCallback((): PreparedSvgExport => {
    if (!rfInstance) {
      throw new Error("SVG export is not yet available");
    }

    const grafanaRenderOptions: GraphSvgRenderOptions | undefined = exportGrafanaBundle
      ? {
          nodeIconSize: grafanaNodeSizePx,
          interfaceScale: grafanaInterfaceSizePercent / 100,
          interfaceLabelOverrides: effectiveInterfaceLabelOverrides
        }
      : undefined;
    const graphSvg = buildGraphSvg(
      rfInstance,
      borderZoom,
      customIcons,
      includeEdgeLabels,
      ANNOTATION_NODE_TYPES,
      exportGrafanaBundle,
      grafanaRenderOptions
    );
    if (!graphSvg) {
      throw new Error("Unable to capture viewport for SVG export");
    }

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

    const baseName = filename.trim() || defaultBaseName;
    return { baseName, finalSvg, graphSvg };
  }, [
    exportGrafanaBundle,
    grafanaNodeSizePx,
    grafanaInterfaceSizePercent,
    effectiveInterfaceLabelOverrides,
    rfInstance,
    borderZoom,
    customIcons,
    includeEdgeLabels,
    borderPadding,
    includeAnnotations,
    totalAnnotations,
    groups,
    textAnnotations,
    shapeAnnotations,
    backgroundOption,
    customBackgroundColor,
    filename,
    defaultBaseName
  ]);

  const exportPlainSvg = useCallback((prepared: PreparedSvgExport): void => {
    downloadSvg(prepared.finalSvg, `${prepared.baseName}.svg`);
    setExportStatus({
      type: "success",
      message: "SVG exported successfully"
    });
  }, []);

  const exportGrafanaBundleFiles = useCallback(
    async (prepared: PreparedSvgExport): Promise<void> => {
      if (!hasStrictlyAscendingThresholds(trafficThresholds)) {
        throw new Error(
          "Traffic thresholds must be strictly ascending (green < yellow < orange < red)"
        );
      }

      const mappings = collectGrafanaEdgeCellMappings(
        prepared.graphSvg.edges,
        prepared.graphSvg.nodes,
        ANNOTATION_NODE_TYPES
      );
      let grafanaBaseSvg = sanitizeSvgForGrafana(prepared.finalSvg);
      if (excludeNodesWithoutLinks) {
        const linkedNodeIds = collectLinkedNodeIds(
          prepared.graphSvg.edges,
          prepared.graphSvg.nodes,
          ANNOTATION_NODE_TYPES
        );
        grafanaBaseSvg = removeUnlinkedNodesFromSvg(grafanaBaseSvg, linkedNodeIds);
        grafanaBaseSvg = trimGrafanaSvgToTopologyContent(
          grafanaBaseSvg,
          Math.max(6, borderPadding)
        );
      }

      let grafanaSvg = applyGrafanaCellIdsToSvg(grafanaBaseSvg, mappings);
      if (includeGrafanaLegend) {
        grafanaSvg = addGrafanaTrafficLegend(grafanaSvg, trafficThresholds, trafficThresholdUnit);
      }
      grafanaSvg = makeGrafanaSvgResponsive(grafanaSvg);
      const panelYaml = buildGrafanaPanelYaml(mappings, { trafficThresholds });
      const dashboardJson = buildGrafanaDashboardJson(panelYaml, grafanaSvg, prepared.baseName);

      const requestId = createRequestId();
      const files = await requestGrafanaBundleExport({
        requestId,
        baseName: prepared.baseName,
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
    },
    [
      trafficThresholds,
      excludeNodesWithoutLinks,
      borderPadding,
      includeGrafanaLegend,
      trafficThresholdUnit
    ]
  );

  const handleExport = useCallback(async () => {
    if (!isExportAvailable || !rfInstance) {
      setExportStatus({
        type: "error",
        message: "SVG export is not yet available"
      });
      return;
    }
    setIsExporting(true);
    setExportStatus(null);
    try {
      log.info(`[SvgExport] Export requested: zoom=${borderZoom}%, padding=${borderPadding}px`);
      const prepared = prepareSvgExport();
      if (!exportGrafanaBundle) {
        exportPlainSvg(prepared);
        return;
      }
      await exportGrafanaBundleFiles(prepared);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`[SvgExport] Export failed: ${errorMessage}`);
      setExportStatus({ type: "error", message: `Export failed: ${errorMessage}` });
    } finally {
      setIsExporting(false);
    }
  }, [
    isExportAvailable,
    borderZoom,
    borderPadding,
    exportGrafanaBundle,
    rfInstance,
    prepareSvgExport,
    exportPlainSvg,
    exportGrafanaBundleFiles
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
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        data-testid="svg-export-modal"
      >
        <DialogTitleWithClose title="Export SVG" onClose={onClose} />
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 2 }}>
            <TextField
              label="Filename"
              size="small"
              fullWidth
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={defaultBaseName}
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
                  input: {
                    endAdornment: <InputAdornment position="end">%</InputAdornment>
                  }
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
                  input: {
                    endAdornment: <InputAdornment position="end">px</InputAdornment>
                  }
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
              onChange={(e) => setBackgroundOption(parseBackgroundOption(e.target.value))}
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={exportGrafanaBundle}
                    onChange={(e) => setExportGrafanaBundle(e.target.checked)}
                  />
                }
                label="Grafana bundle"
                data-testid="svg-export-grafana-bundle"
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsIcon />}
                disabled={!exportGrafanaBundle}
                onClick={() => setIsGrafanaSettingsOpen(true)}
                data-testid="svg-export-grafana-advanced-btn"
              >
                Advanced Grafana Settings
              </Button>
            </Box>
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
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0.3,
                  ...PREVIEW_GRID_BG_SX
                }}
              />
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
              <Alert
                severity={exportStatus.type === "success" ? "success" : "error"}
                variant="outlined"
                sx={{
                  color: "text.primary",
                  "& .MuiAlert-message": {
                    color: "text.primary"
                  }
                }}
              >
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

      <Dialog
        open={isGrafanaSettingsOpen}
        onClose={() => setIsGrafanaSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        data-testid="svg-export-grafana-settings-modal"
      >
        <DialogTitleWithClose
          title="Advanced Grafana Settings"
          onClose={() => setIsGrafanaSettingsOpen(false)}
        />
        <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Tabs
            value={grafanaSettingsTab}
            onChange={(_event, value) => setGrafanaSettingsTab(parseGrafanaSettingsTab(value))}
            variant="fullWidth"
          >
            <Tab label="General" value="general" />
            <Tab label="Interface Names" value="interface-names" />
          </Tabs>

          {grafanaSettingsTab === "general" && (
            <>
              <Typography variant="body2" color="text.secondary">
                Configure thresholds and topology sizing used in the exported Grafana panel.
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                <TextField
                  label="Node size"
                  type="number"
                  size="small"
                  value={grafanaNodeSizePx}
                  onChange={(e) =>
                    setGrafanaNodeSizePx(
                      parseBoundedNumber(e.target.value, 12, 240, DEFAULT_GRAFANA_NODE_SIZE_PX)
                    )
                  }
                  slotProps={{
                    htmlInput: { min: 12, max: 240, step: 1 },
                    input: {
                      endAdornment: <InputAdornment position="end">px</InputAdornment>
                    }
                  }}
                />
                <TextField
                  label="Interface size"
                  type="number"
                  size="small"
                  value={grafanaInterfaceSizePercent}
                  onChange={(e) =>
                    setGrafanaInterfaceSizePercent(
                      parseBoundedNumber(
                        e.target.value,
                        40,
                        400,
                        DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT
                      )
                    )
                  }
                  slotProps={{
                    htmlInput: { min: 40, max: 400, step: 5 },
                    input: {
                      endAdornment: <InputAdornment position="end">%</InputAdornment>
                    }
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Use larger values for dense topologies with many interfaces.
              </Typography>
              <Divider />
              <TextField
                select
                label="Traffic threshold unit"
                size="small"
                value={trafficThresholdUnit}
                onChange={(e) => setTrafficThresholdUnit(parseTrafficThresholdUnit(e.target.value))}
              >
                <MenuItem value="kbit">kbit/s</MenuItem>
                <MenuItem value="mbit">Mbit/s</MenuItem>
                <MenuItem value="gbit">Gbit/s</MenuItem>
              </TextField>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                <TextField
                  label="Green threshold"
                  type="number"
                  size="small"
                  value={formatThresholdForUnit(trafficThresholds.green, trafficThresholdUnit)}
                  onChange={(e) => updateTrafficThreshold("green", e.target.value)}
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      step: getThresholdUnitStep(trafficThresholdUnit)
                    }
                  }}
                />
                <TextField
                  label="Yellow threshold"
                  type="number"
                  size="small"
                  value={formatThresholdForUnit(trafficThresholds.yellow, trafficThresholdUnit)}
                  onChange={(e) => updateTrafficThreshold("yellow", e.target.value)}
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      step: getThresholdUnitStep(trafficThresholdUnit)
                    }
                  }}
                />
                <TextField
                  label="Orange threshold"
                  type="number"
                  size="small"
                  value={formatThresholdForUnit(trafficThresholds.orange, trafficThresholdUnit)}
                  onChange={(e) => updateTrafficThreshold("orange", e.target.value)}
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      step: getThresholdUnitStep(trafficThresholdUnit)
                    }
                  }}
                />
                <TextField
                  label="Red threshold"
                  type="number"
                  size="small"
                  value={formatThresholdForUnit(trafficThresholds.red, trafficThresholdUnit)}
                  onChange={(e) => updateTrafficThreshold("red", e.target.value)}
                  slotProps={{
                    htmlInput: {
                      min: 0,
                      step: getThresholdUnitStep(trafficThresholdUnit)
                    }
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                Values must be strictly ascending: green &lt; yellow &lt; orange &lt; red (within
                selected unit).
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={excludeNodesWithoutLinks}
                    onChange={(e) => setExcludeNodesWithoutLinks(e.target.checked)}
                  />
                }
                label="Exclude nodes without any links"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={includeGrafanaLegend}
                    onChange={(e) => setIncludeGrafanaLegend(e.target.checked)}
                  />
                }
                label="Add traffic legend (top-left)"
              />
            </>
          )}

          {grafanaSettingsTab === "interface-names" && (
            <>
              <Typography variant="body2" color="text.secondary">
                Filter links and choose which interface segment should be shown in endpoint bubbles.
              </Typography>
              <TextField
                select
                size="small"
                label="Global override (all interfaces)"
                value={globalInterfaceOverrideSelection}
                onChange={(e) => setGlobalInterfaceOverrideSelection(e.target.value)}
              >
                <MenuItem value={INTERFACE_SELECT_AUTO}>Auto</MenuItem>
                <MenuItem value={INTERFACE_SELECT_FULL}>Full interface name</MenuItem>
                {Array.from({ length: maxInterfacePartCount }, (_, index) => index + 1).map(
                  (partIndex) => (
                    <MenuItem
                      key={`global-interface-part-${partIndex}`}
                      value={`${GLOBAL_INTERFACE_PART_INDEX_PREFIX}${partIndex}`}
                    >
                      Part {partIndex}
                    </MenuItem>
                  )
                )}
              </TextField>
              <Typography variant="caption" color="text.secondary">
                Default for every interface; per-link overrides below take precedence.
              </Typography>
              <TextField
                size="small"
                label="Filter links"
                placeholder="Search node or interface name"
                value={interfaceLinkFilter}
                onChange={(e) => setInterfaceLinkFilter(e.target.value)}
              />
              <Typography variant="caption" color="text.secondary">
                {filteredInterfaceRows.length} of {interfaceRows.length} links shown
              </Typography>
              <Box
                sx={{
                  maxHeight: 360,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1
                }}
              >
                {filteredInterfaceRows.length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      No links match the current filter.
                    </Typography>
                  </Paper>
                ) : (
                  filteredInterfaceRows.map((row) => {
                    const sourceParts = splitInterfaceParts(row.sourceEndpoint);
                    const targetParts = splitInterfaceParts(row.targetEndpoint);

                    return (
                      <Paper key={row.edgeId} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {row.source} ↔ {row.target}
                        </Typography>
                        <Box
                          sx={{
                            mt: 1,
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 1
                          }}
                        >
                          <TextField
                            select
                            size="small"
                            label={row.sourceEndpoint}
                            value={getInterfaceSelectionValue(
                              row.sourceEndpoint,
                              interfaceLabelOverrides
                            )}
                            onChange={(e) =>
                              updateInterfaceOverride(row.sourceEndpoint, e.target.value)
                            }
                          >
                            <MenuItem value={INTERFACE_SELECT_AUTO}>Auto (use global)</MenuItem>
                            <MenuItem value={INTERFACE_SELECT_FULL}>
                              Full: {row.sourceEndpoint}
                            </MenuItem>
                            {sourceParts.map((part, idx) => (
                              <MenuItem
                                key={`${row.edgeId}-source-${idx}-${part}`}
                                value={`${INTERFACE_SELECT_TOKEN_PREFIX}${part}`}
                              >
                                Part {idx + 1}: {part}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            select
                            size="small"
                            label={row.targetEndpoint}
                            value={getInterfaceSelectionValue(
                              row.targetEndpoint,
                              interfaceLabelOverrides
                            )}
                            onChange={(e) =>
                              updateInterfaceOverride(row.targetEndpoint, e.target.value)
                            }
                          >
                            <MenuItem value={INTERFACE_SELECT_AUTO}>Auto (use global)</MenuItem>
                            <MenuItem value={INTERFACE_SELECT_FULL}>
                              Full: {row.targetEndpoint}
                            </MenuItem>
                            {targetParts.map((part, idx) => (
                              <MenuItem
                                key={`${row.edgeId}-target-${idx}-${part}`}
                                value={`${INTERFACE_SELECT_TOKEN_PREFIX}${part}`}
                              >
                                Part {idx + 1}: {part}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>
                      </Paper>
                    );
                  })
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsGrafanaSettingsOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
