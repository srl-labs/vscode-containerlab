import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Box from "@mui/material/Box";

import type { TrafficRateAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { useGraphStore } from "../../../../stores/graphStore";
import { resolveComputedColor } from "../../../../utils/color";
import { getTrafficMonitorOptions } from "../../../../utils/trafficRateAnnotation";
import { CheckboxField, ColorField, InputField, PanelSection, SelectField } from "../../../ui/form";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";

export interface TrafficRateEditorViewProps {
  annotation: TrafficRateAnnotation | null;
  onSave: (annotation: TrafficRateAnnotation) => void;
  onPreview?: (annotation: TrafficRateAnnotation) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
  onFooterRef?: (ref: TrafficRateEditorFooterRef | null) => void;
}

export interface TrafficRateEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 170;
const DEFAULT_TEXT_WIDTH = 100;
const DEFAULT_TEXT_HEIGHT = 30;
const DEFAULT_BACKGROUND_OPACITY = 20;
const DEFAULT_BORDER_WIDTH = 1;
const DEFAULT_BORDER_RADIUS_CHART = 8;
const DEFAULT_BORDER_RADIUS_TEXT = 4;
const FALLBACK_BACKGROUND_COLOR = "#1e1e1e";
const FALLBACK_BORDER_COLOR = "#3f3f46";
const FALLBACK_TEXT_COLOR = "#9aa0a6";

function getThemeTrafficRateDefaults(): { backgroundColor: string; borderColor: string; textColor: string } {
  return {
    backgroundColor: resolveComputedColor("--vscode-editor-background", FALLBACK_BACKGROUND_COLOR),
    borderColor: resolveComputedColor("--vscode-panel-border", FALLBACK_BORDER_COLOR),
    textColor: resolveComputedColor("--vscode-descriptionForeground", FALLBACK_TEXT_COLOR)
  };
}

function canSave(annotation: TrafficRateAnnotation): boolean {
  return (
    typeof annotation.nodeId === "string" &&
    annotation.nodeId.trim().length > 0 &&
    typeof annotation.interfaceName === "string" &&
    annotation.interfaceName.trim().length > 0
  );
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const TrafficRateEditorView: React.FC<TrafficRateEditorViewProps> = ({
  annotation,
  onSave,
  onPreview,
  onClose,
  onDelete,
  readOnly = false,
  onFooterRef
}) => {
  const graphNodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);

  const { formData, updateField, hasChanges, resetInitialData, discardChanges } =
    useGenericFormState(annotation);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const initialAnnotationRef = useRef<TrafficRateAnnotation | null>(null);
  const initialSerializedRef = useRef<string | null>(null);
  const hasPreviewRef = useRef(false);

  useEffect(() => {
    if (!annotation) {
      initialAnnotationRef.current = null;
      initialSerializedRef.current = null;
      hasPreviewRef.current = false;
      return;
    }

    initialAnnotationRef.current = { ...annotation };
    initialSerializedRef.current = JSON.stringify(annotation);
    hasPreviewRef.current = false;
  }, [annotation]);

  useEffect(() => {
    if (readOnly || !formData || !initialAnnotationRef.current) return;
    if (!previewRef.current) return;

    const serialized = JSON.stringify(formData);
    if (serialized === initialSerializedRef.current) return;

    previewRef.current(formData);
    hasPreviewRef.current = true;
  }, [formData, readOnly]);

  // Revert live preview when leaving editor without apply/save.
  useEffect(() => {
    return () => {
      if (!hasPreviewRef.current || !initialAnnotationRef.current) return;
      previewRef.current?.(initialAnnotationRef.current);
    };
  }, []);

  const topologyNodeIds = useMemo(() => {
    return graphNodes
      .filter((node) => node.type === "topology-node")
      .map((node) => node.id)
      .sort((a, b) => a.localeCompare(b));
  }, [graphNodes]);

  const trafficOptions = useMemo(() => getTrafficMonitorOptions(edges), [edges]);

  const nodeOptions = useMemo(() => {
    const ids = new Set<string>([...topologyNodeIds, ...trafficOptions.nodeIds]);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [topologyNodeIds, trafficOptions.nodeIds]);

  const interfaceOptions = useMemo(() => {
    if (!formData?.nodeId) return [];
    return trafficOptions.interfacesByNode.get(formData.nodeId) ?? [];
  }, [trafficOptions.interfacesByNode, formData?.nodeId]);

  const nodeSelectOptions = useMemo(
    () => [{ value: "", label: "Select node" }, ...nodeOptions.map((nodeId) => ({
      value: nodeId,
      label: nodeId
    }))],
    [nodeOptions]
  );

  const interfaceSelectOptions = useMemo(
    () => [
      {
        value: "",
        label: formData?.nodeId ? "Select interface" : "Select node first"
      },
      ...interfaceOptions.map((interfaceName) => ({
        value: interfaceName,
        label: interfaceName
      }))
    ],
    [formData?.nodeId, interfaceOptions]
  );

  const handleNodeChange = useCallback(
    (nodeId: string) => {
      if (!formData) return;
      updateField("nodeId", nodeId);

      const availableInterfaces = trafficOptions.interfacesByNode.get(nodeId) ?? [];
      const currentInterface =
        typeof formData.interfaceName === "string" ? formData.interfaceName : "";
      const nextInterface = availableInterfaces.includes(currentInterface)
        ? currentInterface
        : (availableInterfaces[0] ?? "");
      updateField("interfaceName", nextInterface);
    },
    [formData, updateField, trafficOptions.interfacesByNode]
  );

  const handleModeChange = useCallback(
    (value: string) => {
      if (!formData) return;
      const nextMode = value === "text" ? "text" : "chart";
      updateField("mode", nextMode);

      // Apply mode defaults when the current value is unset or still on the previous mode's default.
      if (nextMode === "text") {
        if (formData.width === undefined || formData.width === DEFAULT_WIDTH) {
          updateField("width", DEFAULT_TEXT_WIDTH);
        }
        if (formData.height === undefined || formData.height === DEFAULT_HEIGHT) {
          updateField("height", DEFAULT_TEXT_HEIGHT);
        }
        if (
          formData.borderRadius === undefined ||
          formData.borderRadius === DEFAULT_BORDER_RADIUS_CHART
        ) {
          updateField("borderRadius", DEFAULT_BORDER_RADIUS_TEXT);
        }
      } else {
        if (formData.width === undefined || formData.width === DEFAULT_TEXT_WIDTH) {
          updateField("width", DEFAULT_WIDTH);
        }
        if (formData.height === undefined || formData.height === DEFAULT_TEXT_HEIGHT) {
          updateField("height", DEFAULT_HEIGHT);
        }
        if (
          formData.borderRadius === undefined ||
          formData.borderRadius === DEFAULT_BORDER_RADIUS_TEXT
        ) {
          updateField("borderRadius", DEFAULT_BORDER_RADIUS_CHART);
        }
      }
    },
    [formData, updateField]
  );

  const canSaveNow = formData ? canSave(formData) : false;

  const saveWithCommit = useCallback(
    (next: TrafficRateAnnotation) => {
      hasPreviewRef.current = false;
      initialAnnotationRef.current = { ...next };
      initialSerializedRef.current = JSON.stringify(next);
      onSave(next);
    },
    [onSave]
  );

  const discardWithRevert = useCallback(() => {
    discardChanges();
    if (initialAnnotationRef.current) {
      previewRef.current?.(initialAnnotationRef.current);
    }
    hasPreviewRef.current = false;
  }, [discardChanges]);

  useEditorHandlersWithFooterRef({
    formData,
    onSave: saveWithCommit,
    onClose,
    onDelete,
    resetInitialData,
    discardChanges: discardWithRevert,
    onFooterRef,
    canSave,
    hasChangesForFooter: hasChanges && canSaveNow
  });

  if (!formData) return null;

  const mode = formData.mode === "text" ? "text" : "chart";
  const textMetric =
    formData.textMetric === "rx" || formData.textMetric === "tx" ? formData.textMetric : "combined";
  const themeDefaults = getThemeTrafficRateDefaults();
  const defaultWidthForMode = mode === "text" ? DEFAULT_TEXT_WIDTH : DEFAULT_WIDTH;
  const defaultHeightForMode = mode === "text" ? DEFAULT_TEXT_HEIGHT : DEFAULT_HEIGHT;
  const defaultBorderRadiusForMode =
    mode === "text" ? DEFAULT_BORDER_RADIUS_TEXT : DEFAULT_BORDER_RADIUS_CHART;
  const width = formData.width ?? defaultWidthForMode;
  const height = formData.height ?? defaultHeightForMode;
  const widthMin = mode === "text" ? 1 : 180;
  const heightMin = mode === "text" ? 1 : 120;
  const opacityValue = String(formData.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY);
  const borderWidthValue = String(formData.borderWidth ?? DEFAULT_BORDER_WIDTH);
  const borderRadiusValue = String(formData.borderRadius ?? defaultBorderRadiusForMode);

  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <PanelSection title="Monitor" withTopDivider={false}>
            <>
              <SelectField
                id="traffic-rate-mode"
                label="Mode"
                value={mode}
                onChange={handleModeChange}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "text", label: "Text" }
                ]}
              />
              {mode === "text" && (
                <SelectField
                  id="traffic-rate-text-metric"
                  label="Text value"
                  value={textMetric}
                  onChange={(value) =>
                    updateField("textMetric", value as TrafficRateAnnotation["textMetric"])
                  }
                  options={[
                    { value: "combined", label: "Combined (RX + TX)" },
                    { value: "rx", label: "RX only" },
                    { value: "tx", label: "TX only" }
                  ]}
                />
              )}
              <SelectField
                id="traffic-rate-node"
                label="Node"
                value={formData.nodeId ?? ""}
                onChange={handleNodeChange}
                options={nodeSelectOptions}
              />
              <SelectField
                id="traffic-rate-interface"
                label="Interface"
                value={formData.interfaceName ?? ""}
                onChange={(value) => updateField("interfaceName", value)}
                options={interfaceSelectOptions}
                disabled={!formData.nodeId}
              />
            </>
          </PanelSection>

          <PanelSection title="Size">
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <InputField
                id="traffic-rate-width"
                label="Width"
                type="number"
                value={String(width)}
                onChange={(value) => {
                  const parsed = parseOptionalNumber(value);
                  updateField(
                    "width",
                    parsed === undefined ? defaultWidthForMode : clamp(parsed, widthMin, 2000)
                  );
                }}
                min={widthMin}
                max={2000}
                suffix="px"
              />
              <InputField
                id="traffic-rate-height"
                label="Height"
                type="number"
                value={String(height)}
                onChange={(value) => {
                  const parsed = parseOptionalNumber(value);
                  updateField(
                    "height",
                    parsed === undefined ? defaultHeightForMode : clamp(parsed, heightMin, 1200)
                  );
                }}
                min={heightMin}
                max={1200}
                suffix="px"
              />
            </Box>
          </PanelSection>

          <PanelSection
            title="Background"
            bodySx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, p: 2 }}
          >
            <>
              <ColorField
                label="Color"
                value={formData.backgroundColor ?? themeDefaults.backgroundColor}
                onChange={(value) => updateField("backgroundColor", value)}
              />
              <InputField
                id="traffic-rate-bg-opacity"
                label="Opacity"
                type="number"
                value={opacityValue}
                onChange={(value) => {
                  const parsed = parseOptionalNumber(value);
                  updateField(
                    "backgroundOpacity",
                    parsed === undefined
                      ? DEFAULT_BACKGROUND_OPACITY
                      : clamp(parsed, 0, 100)
                  );
                }}
                min={0}
                max={100}
                suffix="%"
                clearable
              />
            </>
          </PanelSection>

          <PanelSection title="Border">
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <ColorField
                label="Color"
                value={formData.borderColor ?? themeDefaults.borderColor}
                onChange={(value) => updateField("borderColor", value)}
              />
              <InputField
                id="traffic-rate-border-width"
                label="Width"
                type="number"
                value={borderWidthValue}
                onChange={(value) => {
                  const parsed = parseOptionalNumber(value);
                  updateField(
                    "borderWidth",
                    parsed === undefined ? DEFAULT_BORDER_WIDTH : clamp(parsed, 0, 20)
                  );
                }}
                min={0}
                max={20}
                step={0.5}
                suffix="px"
                clearable
              />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <SelectField
                id="traffic-rate-border-style"
                label="Style"
                value={formData.borderStyle ?? "solid"}
                onChange={(value) =>
                  updateField("borderStyle", value as TrafficRateAnnotation["borderStyle"])
                }
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "dashed", label: "Dashed" },
                  { value: "dotted", label: "Dotted" },
                  { value: "double", label: "Double" }
                ]}
              />
              <InputField
                id="traffic-rate-border-radius"
                label="Corner Radius"
                type="number"
                value={borderRadiusValue}
                onChange={(value) => {
                  const parsed = parseOptionalNumber(value);
                  updateField(
                    "borderRadius",
                    parsed === undefined ? defaultBorderRadiusForMode : clamp(parsed, 0, 50)
                  );
                }}
                min={0}
                max={50}
                suffix="px"
                clearable
              />
            </Box>
          </PanelSection>

          <PanelSection title="Text" bodySx={{ p: 2 }}>
            <ColorField
              label="Text Color"
              value={formData.textColor ?? themeDefaults.textColor}
              onChange={(value) => updateField("textColor", value)}
            />
          </PanelSection>

          {mode === "chart" && (
            <PanelSection title="Chart" bodySx={{ p: 2 }}>
              <CheckboxField
                id="traffic-rate-show-legend"
                label="Show legend"
                checked={formData.showLegend !== false}
                onChange={(checked) => updateField("showLegend", checked ? undefined : false)}
              />
            </PanelSection>
          )}
        </Box>
      </fieldset>
    </Box>
  );
};
