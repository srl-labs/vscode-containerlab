import React, { useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  InputAdornment,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";

import { useEdges } from "../../stores/graphStore";
import { useTopoViewerStore } from "../../stores/topoViewerStore";
import { DialogTitleWithClose } from "../ui/dialog/DialogChrome";
import {
  DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT,
  DEFAULT_GRAFANA_NODE_SIZE_PX,
  GLOBAL_INTERFACE_PART_INDEX_PREFIX,
  INTERFACE_SELECT_AUTO,
  INTERFACE_SELECT_FULL,
  INTERFACE_SELECT_TOKEN_PREFIX,
  clampGrafanaInterfaceSizePercent,
  clampGrafanaNodeSizePx,
  getInterfaceSelectionValue,
  parseBoundedNumber,
  resolveInterfaceOverrideValue,
  splitInterfaceParts
} from "../../utils/grafanaInterfaceLabels";

interface EdgeInterfaceRow {
  edgeId: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

type GrafanaSettingsTab = "general" | "interface-names";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseGrafanaSettingsTab(value: unknown): GrafanaSettingsTab {
  return value === "interface-names" ? "interface-names" : "general";
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

export interface GrafanaLabelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GrafanaLabelSettingsModal: React.FC<GrafanaLabelSettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const edges = useEdges();
  const [tab, setTab] = useState<GrafanaSettingsTab>("general");
  const [interfaceLinkFilter, setInterfaceLinkFilter] = useState("");

  const grafanaNodeSizePx = useTopoViewerStore((state) => state.grafanaNodeSizePx);
  const grafanaInterfaceSizePercent = useTopoViewerStore(
    (state) => state.grafanaInterfaceSizePercent
  );
  const globalInterfaceOverrideSelection = useTopoViewerStore(
    (state) => state.grafanaGlobalInterfaceOverrideSelection
  );
  const interfaceLabelOverrides = useTopoViewerStore(
    (state) => state.grafanaInterfaceLabelOverrides
  );

  const setGrafanaNodeSizePx = useTopoViewerStore((state) => state.setGrafanaNodeSizePx);
  const setGrafanaInterfaceSizePercent = useTopoViewerStore(
    (state) => state.setGrafanaInterfaceSizePercent
  );
  const setGrafanaGlobalInterfaceOverrideSelection = useTopoViewerStore(
    (state) => state.setGrafanaGlobalInterfaceOverrideSelection
  );
  const setGrafanaInterfaceLabelOverride = useTopoViewerStore(
    (state) => state.setGrafanaInterfaceLabelOverride
  );

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

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="navbar-grafana-label-settings-modal"
    >
      <DialogTitleWithClose title="Grafana Label Settings" onClose={onClose} />
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Tabs
          value={tab}
          onChange={(_event, value) => setTab(parseGrafanaSettingsTab(value))}
          variant="fullWidth"
        >
          <Tab label="General" value="general" />
          <Tab label="Interface Names" value="interface-names" />
        </Tabs>

        {tab === "general" && (
          <>
            <Typography variant="body2" color="text.secondary">
              Runtime settings for Grafana label mode.
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <TextField
                label="Node size"
                type="number"
                size="small"
                value={grafanaNodeSizePx}
                onChange={(e) =>
                  setGrafanaNodeSizePx(
                    clampGrafanaNodeSizePx(
                      parseBoundedNumber(e.target.value, 12, 240, DEFAULT_GRAFANA_NODE_SIZE_PX)
                    )
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
                    clampGrafanaInterfaceSizePercent(
                      parseBoundedNumber(
                        e.target.value,
                        40,
                        400,
                        DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT
                      )
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
              These apply instantly when Link Labels mode is set to Grafana.
            </Typography>
          </>
        )}

        {tab === "interface-names" && (
          <>
            <Typography variant="body2" color="text.secondary">
              Choose how interface labels are displayed globally and per-link endpoint.
            </Typography>
            <TextField
              select
              size="small"
              label="Global override (all interfaces)"
              value={globalInterfaceOverrideSelection}
              onChange={(e) => setGrafanaGlobalInterfaceOverrideSelection(e.target.value)}
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
              Per-interface overrides below take precedence.
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
                            setGrafanaInterfaceLabelOverride(
                              row.sourceEndpoint,
                              resolveInterfaceOverrideValue(row.sourceEndpoint, e.target.value)
                            )
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
                            setGrafanaInterfaceLabelOverride(
                              row.targetEndpoint,
                              resolveInterfaceOverrideValue(row.targetEndpoint, e.target.value)
                            )
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
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
};
