import React, { useEffect, useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";
import CheckIcon from "@mui/icons-material/Check";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Box,
  Button,
  MenuItem,
  Paper,
  Slider,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";

import { useEdges } from "../../../stores/graphStore";
import { useTopoViewerStore } from "../../../stores/topoViewerStore";
import {
  DEFAULT_TELEMETRY_INTERFACE_SIZE_PERCENT,
  DEFAULT_TELEMETRY_NODE_SIZE_PX,
  GLOBAL_INTERFACE_PART_INDEX_PREFIX,
  INTERFACE_SELECT_AUTO,
  INTERFACE_SELECT_FULL,
  INTERFACE_SELECT_TOKEN_PREFIX,
  clampTelemetryInterfaceSizePercent,
  clampTelemetryNodeSizePx,
  getInterfaceSelectionValue,
  parseBoundedNumber,
  resolveInterfaceOverrideValue,
  splitInterfaceParts
} from "../../../utils/telemetryInterfaceLabels";
import { invertHexColor, resolveComputedColor } from "../../../utils/color";
import type { GridSettingsControlsProps } from "../GridSettingsPopover";
import { ColorField, InputField } from "../../ui/form";

interface EdgeInterfaceRow {
  edgeId: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

interface AppearanceTabProps extends GridSettingsControlsProps {
  isReadOnly: boolean;
}

type TelemetryStyleValue = "default" | "telemetry-style";
type AppearanceSubTab = "style" | "grid";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isGridStyle(value: unknown): value is GridSettingsControlsProps["gridStyle"] {
  return value === "dotted" || value === "quadratic";
}

function extractEdgeInterfaceRows(edges: Edge[]): EdgeInterfaceRow[] {
  const rows: EdgeInterfaceRow[] = [];
  for (const edge of edges) {
    const sourceEndpoint = asNonEmptyString(edge.data?.sourceEndpoint);
    const targetEndpoint = asNonEmptyString(edge.data?.targetEndpoint);
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

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  gridColor,
  onGridColorChange,
  gridBgColor,
  onGridBgColorChange,
  onResetGridColors,
  isReadOnly
}) => {
  const edges = useEdges();
  const [activeSubTab, setActiveSubTab] = useState<AppearanceSubTab>("style");
  const [interfaceLinkFilter, setInterfaceLinkFilter] = useState("");
  const [themeBgColor, setThemeBgColor] = useState("#1e1e1e");

  const linkLabelMode = useTopoViewerStore((state) => state.linkLabelMode);
  const lastNonTelemetryLinkLabelMode = useTopoViewerStore(
    (state) => state.lastNonTelemetryLinkLabelMode
  );

  const telemetryNodeSizePx = useTopoViewerStore((state) => state.telemetryNodeSizePx);
  const telemetryInterfaceSizePercent = useTopoViewerStore(
    (state) => state.telemetryInterfaceSizePercent
  );
  const globalInterfaceOverrideSelection = useTopoViewerStore(
    (state) => state.telemetryGlobalInterfaceOverrideSelection
  );
  const interfaceLabelOverrides = useTopoViewerStore(
    (state) => state.telemetryInterfaceLabelOverrides
  );

  const setLinkLabelMode = useTopoViewerStore((state) => state.setLinkLabelMode);
  const setTelemetryNodeSizePx = useTopoViewerStore((state) => state.setTelemetryNodeSizePx);
  const setTelemetryInterfaceSizePercent = useTopoViewerStore(
    (state) => state.setTelemetryInterfaceSizePercent
  );
  const setTelemetryGlobalInterfaceOverrideSelection = useTopoViewerStore(
    (state) => state.setTelemetryGlobalInterfaceOverrideSelection
  );
  const setTelemetryInterfaceLabelOverride = useTopoViewerStore(
    (state) => state.setTelemetryInterfaceLabelOverride
  );

  const telemetryStyleValue: TelemetryStyleValue =
    linkLabelMode === "telemetry-style" ? "telemetry-style" : "default";
  const isTelemetryStyleEnabled = telemetryStyleValue === "telemetry-style";
  const hasCustomGridColors = gridColor !== null || gridBgColor !== null;

  useEffect(() => {
    setThemeBgColor(resolveComputedColor("--vscode-editor-background", "#1e1e1e"));
  }, []);

  const interfaceRows = useMemo(() => extractEdgeInterfaceRows(edges), [edges]);

  const filteredInterfaceRows = useMemo(() => {
    const filterValue = interfaceLinkFilter.trim().toLowerCase();
    if (filterValue.length === 0) return interfaceRows;
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

  const effectiveGridBgColor = gridBgColor ?? themeBgColor;
  const defaultGridColor = invertHexColor(effectiveGridBgColor);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Tabs
        value={activeSubTab}
        onChange={(_event, value) => setActiveSubTab(value === "grid" ? "grid" : "style")}
        variant="fullWidth"
      >
        <Tab label="Style" value="style" data-testid="lab-settings-appearance-subtab-style" />
        <Tab label="Grid Settings" value="grid" data-testid="lab-settings-appearance-subtab-grid" />
      </Tabs>

      {activeSubTab === "style" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            select
            size="small"
            label="Style"
            value={telemetryStyleValue}
            disabled={isReadOnly}
            onChange={(e) => {
              if (isReadOnly) return;
              const value = e.target.value;
              const nextLinkLabelMode =
                value === "telemetry-style" ? "telemetry-style" : lastNonTelemetryLinkLabelMode;
              setLinkLabelMode(nextLinkLabelMode);
            }}
            data-testid="lab-settings-telemetry-style"
          >
            <MenuItem value="default">Default</MenuItem>
            <MenuItem value="telemetry-style">Telemetry Style</MenuItem>
          </TextField>

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <InputField
              id="telemetry-node-size"
              label="Node size"
              type="number"
              value={String(telemetryNodeSizePx)}
              min={12}
              max={240}
              step={1}
              suffix="px"
              disabled={isReadOnly}
              onChange={(value) => {
                if (isReadOnly) return;
                const nextTelemetryNodeSizePx = clampTelemetryNodeSizePx(
                  parseBoundedNumber(value, 12, 240, DEFAULT_TELEMETRY_NODE_SIZE_PX)
                );
                setTelemetryNodeSizePx(nextTelemetryNodeSizePx);
              }}
            />
            <InputField
              id="telemetry-interface-size"
              label="Interface size"
              type="number"
              value={String(telemetryInterfaceSizePercent)}
              min={40}
              max={400}
              step={5}
              suffix="%"
              disabled={isReadOnly}
              onChange={(value) => {
                if (isReadOnly) return;
                const nextTelemetryInterfaceSizePercent = clampTelemetryInterfaceSizePercent(
                  parseBoundedNumber(value, 40, 400, DEFAULT_TELEMETRY_INTERFACE_SIZE_PERCENT)
                );
                setTelemetryInterfaceSizePercent(nextTelemetryInterfaceSizePercent);
              }}
            />
          </Box>

          {isTelemetryStyleEnabled ? (
            <>
              <TextField
                select
                size="small"
                label="Global override (all interfaces)"
                value={globalInterfaceOverrideSelection}
                disabled={isReadOnly}
                onChange={(e) => {
                  if (isReadOnly) return;
                  setTelemetryGlobalInterfaceOverrideSelection(e.target.value);
                }}
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
              <TextField
                size="small"
                label="Filter links"
                placeholder="Search node or interface name"
                value={interfaceLinkFilter}
                disabled={isReadOnly}
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
                          {row.source} {"<->"} {row.target}
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
                            disabled={isReadOnly}
                            onChange={(e) => {
                              if (isReadOnly) return;
                              setTelemetryInterfaceLabelOverride(
                                row.sourceEndpoint,
                                resolveInterfaceOverrideValue(row.sourceEndpoint, e.target.value)
                              );
                            }}
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
                            disabled={isReadOnly}
                            onChange={(e) => {
                              if (isReadOnly) return;
                              setTelemetryInterfaceLabelOverride(
                                row.targetEndpoint,
                                resolveInterfaceOverrideValue(row.targetEndpoint, e.target.value)
                              );
                            }}
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
          ) : null}
        </Box>
      ) : null}

      {activeSubTab === "grid" ? (
        <Box
          data-testid="lab-settings-grid-settings"
          sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            Stroke Width
          </Typography>
          <Slider
            data-testid="lab-settings-grid-line-width"
            size="small"
            value={gridLineWidth}
            disabled={isReadOnly}
            onChange={(_event: Event, value: number | number[]) => {
              if (isReadOnly) return;
              const width = Array.isArray(value) ? value[0] : value;
              onGridLineWidthChange(width);
            }}
            min={0.00001}
            max={2}
            step={0.1}
            valueLabelDisplay="auto"
          />

          <Typography variant="body2" color="text.secondary">
            Grid Style
          </Typography>
          <ToggleButtonGroup
            data-testid="lab-settings-grid-style"
            value={gridStyle}
            exclusive
            disabled={isReadOnly}
            onChange={(_event, value) => {
              if (isReadOnly) return;
              if (isGridStyle(value)) {
                onGridStyleChange(value);
              }
            }}
            size="small"
            fullWidth
            sx={{
              "& .MuiToggleButton-root": {
                borderColor: "divider"
              },
              "& .MuiToggleButton-root.Mui-selected": {
                backgroundColor: "action.selected",
                borderColor: "primary.main",
                color: "text.primary",
                fontWeight: 600
              },
              "& .MuiToggleButton-root.Mui-selected:hover": {
                backgroundColor: "action.selected"
              }
            }}
          >
            <ToggleButton value="dotted">
              {gridStyle === "dotted" ? <CheckIcon fontSize="small" sx={{ mr: 0.5 }} /> : null}
              Dotted
            </ToggleButton>
            <ToggleButton value="quadratic">
              {gridStyle === "quadratic" ? <CheckIcon fontSize="small" sx={{ mr: 0.5 }} /> : null}
              Quadratic
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="body2" color="text.secondary">
            Grid Color
          </Typography>
          <ColorField
            value={gridColor ?? defaultGridColor}
            disabled={isReadOnly}
            onChange={(value) => onGridColorChange(value)}
          />

          <Typography variant="body2" color="text.secondary">
            Background Color
          </Typography>
          <ColorField
            value={gridBgColor ?? themeBgColor}
            disabled={isReadOnly}
            onChange={(value) => onGridBgColorChange(value)}
          />

          {hasCustomGridColors ? (
            <Button
              size="small"
              variant="text"
              startIcon={<RestartAltIcon />}
              disabled={isReadOnly}
              onClick={onResetGridColors}
            >
              Reset to theme colors
            </Button>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
};
