import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";

import { MuiThemeProvider } from "../../reactTopoViewer/webview/theme";
import { usePostMessage } from "../shared/hooks";

import type { ContainerPort, InspectContainerData, InspectWebviewInitialData } from "./types";

type InspectOutgoingMessage =
  | { command: "refresh" }
  | {
      command: "openPort";
      containerName: string;
      containerId: string;
      port: string | number;
      protocol: string;
    };

interface InspectRow {
  containerName: string;
  kind: string;
  type: string;
  image: string;
  state: string;
  status: string;
  pid: string;
  ipv4: string;
  ipv6: string;
  network: string;
  owner: string;
  ports: ContainerPort[];
  containerId: string;
  searchText: string;
}

interface InspectGroup {
  labName: string;
  rows: InspectRow[];
}

type ColumnId =
  | "containerName"
  | "kind"
  | "type"
  | "image"
  | "state"
  | "status"
  | "pid"
  | "ipv4"
  | "ipv6"
  | "network"
  | "owner"
  | "ports";

interface ColumnDefinition {
  id: ColumnId;
  label: string;
  value: (row: InspectRow) => string;
  sx?: Record<string, string | number>;
}

interface SortState {
  columnId: ColumnId;
  direction: "asc" | "desc";
}

interface InspectGroupPanelProps {
  readonly group: InspectGroup;
  readonly activeSort?: SortState;
  readonly onToggleSort: (labName: string, columnId: ColumnId) => void;
  readonly onOpenPort: (payload: {
    containerName: string;
    containerId: string;
    port: string | number;
    protocol: string;
  }) => void;
}

const COLUMNS: ReadonlyArray<ColumnDefinition> = [
  { id: "containerName", label: "Name", value: (row) => row.containerName },
  { id: "kind", label: "Kind", value: (row) => row.kind },
  { id: "type", label: "Type", value: (row) => row.type },
  { id: "image", label: "Image", value: (row) => row.image, sx: { minWidth: 180, maxWidth: 240 } },
  { id: "state", label: "State", value: (row) => row.state },
  { id: "status", label: "Status", value: (row) => row.status },
  { id: "pid", label: "PID", value: (row) => row.pid },
  { id: "ipv4", label: "IPv4", value: (row) => row.ipv4 },
  { id: "ipv6", label: "IPv6", value: (row) => row.ipv6 },
  { id: "network", label: "Network", value: (row) => row.network },
  { id: "owner", label: "Owner", value: (row) => row.owner },
  {
    id: "ports",
    label: "Ports",
    value: (row) => row.ports.map((port) => `${port.port}/${port.protocol}`).join(", ")
  }
];

function firstTruthyString(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }
  return "";
}

function getLabName(container: InspectContainerData): string {
  const labelFromPath = container.Labels?.["clab-topo-file"]
    ?.split("/")
    .slice(-1)[0]
    ?.replace(".clab.yml", "");

  return (
    container.lab_name ||
    container.labPath ||
    container.Labels?.containerlab ||
    labelFromPath ||
    "unknown-lab"
  );
}

function buildInspectRow(container: InspectContainerData): InspectRow {
  const containerName = firstTruthyString(
    container.name,
    Array.isArray(container.Names) ? container.Names[0] : "",
    container.Labels?.["clab-node-longname"]
  );

  const kind = firstTruthyString(container.kind, container.Labels?.["clab-node-kind"]);
  const type = firstTruthyString(container.node_type, container.Labels?.["clab-node-type"]);
  const image = firstTruthyString(container.image, container.Image);
  const state = firstTruthyString(container.state, container.State);
  const status = firstTruthyString(container.status, container.Status);
  const pid = typeof container.Pid === "number" ? String(container.Pid) : "";
  const network = firstTruthyString(container.network_name, container.NetworkName);
  const owner = container.Labels?.["clab-owner"] || "";

  const ipv4 = firstTruthyString(
    container.ipv4_address,
    container.NetworkSettings?.IPv4addr,
    container.NetworkSettings?.ipv4_address
  );

  const ipv6 = firstTruthyString(
    container.ipv6_address,
    container.NetworkSettings?.IPv6addr,
    container.NetworkSettings?.ipv6_address
  );

  const containerId = firstTruthyString(
    container.ID,
    container.id,
    container.ShortID,
    container.container_id
  );
  const ports = Array.isArray(container.Ports) ? container.Ports : [];

  const searchText = [
    containerName,
    kind,
    type,
    image,
    state,
    status,
    pid,
    ipv4,
    ipv6,
    network,
    owner,
    ports.map((port) => `${port.port}/${port.protocol}`).join(" ")
  ]
    .join(" ")
    .toLowerCase();

  return {
    containerName,
    kind,
    type,
    image,
    state,
    status,
    pid,
    ipv4,
    ipv6,
    network,
    owner,
    ports,
    containerId,
    searchText
  };
}

function buildGroups(containers: InspectContainerData[]): InspectGroup[] {
  const grouped = new Map<string, InspectRow[]>();

  for (const container of containers) {
    const labName = getLabName(container);
    const rows = grouped.get(labName) ?? [];
    rows.push(buildInspectRow(container));
    grouped.set(labName, rows);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([labName, rows]) => ({ labName, rows }));
}

function parseNumericValue(value: string): number | null {
  const normalized = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function sortRows(rows: InspectRow[], sortState: SortState | undefined): InspectRow[] {
  if (!sortState) {
    return rows;
  }

  const column = COLUMNS.find((candidate) => candidate.id === sortState.columnId);
  if (!column) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    const leftText = column.value(left).trim();
    const rightText = column.value(right).trim();

    const leftNumeric = parseNumericValue(leftText);
    const rightNumeric = parseNumericValue(rightText);

    let result = 0;
    if (leftNumeric !== null && rightNumeric !== null) {
      result = leftNumeric - rightNumeric;
    } else {
      result = leftText.localeCompare(rightText, undefined, { sensitivity: "base" });
    }

    return sortState.direction === "asc" ? result : -result;
  });
}

function createFilter(query: string): (value: string) => boolean {
  const normalized = query.trim();
  if (!normalized) {
    return () => true;
  }

  try {
    const looksLikeRegex =
      normalized.includes("\\") ||
      normalized.includes("[") ||
      normalized.includes("(") ||
      normalized.includes("|") ||
      normalized.includes("^") ||
      normalized.includes("$") ||
      normalized.includes(".*") ||
      normalized.includes(".+");

    let processedPattern = normalized;
    if (!looksLikeRegex) {
      const hasWildcards = /[*?#]/.test(normalized);
      processedPattern = normalized
        .replaceAll("*", ".*")
        .replaceAll("?", ".")
        .replaceAll("#", "\\d+");
      if (hasWildcards) {
        processedPattern = `^${processedPattern}$`;
      }
    }

    const regex = new RegExp(processedPattern, "i");
    return (value: string) => regex.test(value);
  } catch {
    const queryLower = normalized.toLowerCase();
    return (value: string) => value.toLowerCase().includes(queryLower);
  }
}

function stateToColorToken(state: string): string {
  const normalized = state.trim().toLowerCase();
  switch (normalized) {
    case "running":
      return "success.main";
    case "exited":
    case "stopped":
      return "error.main";
    default:
      return "warning.main";
  }
}

interface PortsCellProps {
  readonly row: InspectRow;
  readonly onOpenPort: InspectGroupPanelProps["onOpenPort"];
}

function PortsCell({ row, onOpenPort }: Readonly<PortsCellProps>): React.JSX.Element {
  if (row.ports.length === 0) {
    return <>-</>;
  }

  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      {row.ports.map((port) => {
        const key = `${row.containerId}-${port.port}-${port.protocol}`;
        return (
          <Chip
            key={key}
            size="small"
            variant="outlined"
            clickable
            label={`${port.port}/${port.protocol}`}
            onClick={() => {
              onOpenPort({
                containerName: row.containerName,
                containerId: row.containerId,
                port: port.port,
                protocol: port.protocol
              });
            }}
          />
        );
      })}
    </Stack>
  );
}

function InspectGroupPanel({
  group,
  activeSort,
  onToggleSort,
  onOpenPort
}: Readonly<InspectGroupPanelProps>): React.JSX.Element {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap"
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {group.labName}
        </Typography>
        <Chip size="small" variant="outlined" label={`${group.rows.length} containers`} />
      </Box>

      <TableContainer sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small" aria-label={`Inspect table for ${group.labName}`}>
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell key={column.id} sx={{ whiteSpace: "nowrap", ...column.sx }}>
                  <TableSortLabel
                    active={activeSort?.columnId === column.id}
                    direction={activeSort?.columnId === column.id ? activeSort.direction : "asc"}
                    onClick={() => {
                      onToggleSort(group.labName, column.id);
                    }}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {group.rows.map((row) => (
              <TableRow key={`${group.labName}-${row.containerId || row.containerName}-${row.network}`} hover>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.containerName || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.kind || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.type || "-"}</TableCell>
                <TableCell sx={{ minWidth: 180, maxWidth: 240 }} title={row.image || ""}>
                  <Typography
                    variant="body2"
                    sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {row.image || "-"}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={row.state || "-"}
                    sx={{
                      color: stateToColorToken(row.state),
                      borderColor: stateToColorToken(row.state),
                      fontWeight: 600
                    }}
                  />
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.status || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.pid || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.ipv4 || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.ipv6 || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.network || "-"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{row.owner || "-"}</TableCell>
                <TableCell>
                  <PortsCell row={row} onOpenPort={onOpenPort} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function InspectApp(): React.JSX.Element {
  const initialData = (window.__INITIAL_DATA__ ?? {}) as unknown as InspectWebviewInitialData;
  const containers = Array.isArray(initialData.containers) ? initialData.containers : [];

  const postMessage = usePostMessage<InspectOutgoingMessage>();

  const [searchText, setSearchText] = React.useState("");
  const [sortByLab, setSortByLab] = React.useState<Record<string, SortState | undefined>>({});

  const groupedRows = React.useMemo(() => buildGroups(containers), [containers]);
  const filter = React.useMemo(() => createFilter(searchText), [searchText]);

  const filteredGroups = React.useMemo(() => {
    const hasSearch = searchText.trim().length > 0;

    return groupedRows
      .map((group) => {
        if (!hasSearch) {
          return {
            labName: group.labName,
            rows: sortRows(group.rows, sortByLab[group.labName])
          };
        }

        const labMatches = filter(group.labName);
        const matchingRows = labMatches
          ? group.rows
          : group.rows.filter((row) => filter(row.containerName) || filter(row.searchText));

        if (matchingRows.length === 0) {
          return undefined;
        }

        return {
          labName: group.labName,
          rows: sortRows(matchingRows, sortByLab[group.labName])
        };
      })
      .filter((group): group is InspectGroup => Boolean(group));
  }, [filter, groupedRows, searchText, sortByLab]);

  const hasData = filteredGroups.length > 0;

  const handleToggleSort = React.useCallback((labName: string, columnId: ColumnId) => {
    setSortByLab((current) => {
      const currentSort = current[labName];
      const nextDirection =
        currentSort?.columnId === columnId && currentSort.direction === "asc" ? "desc" : "asc";

      return {
        ...current,
        [labName]: {
          columnId,
          direction: nextDirection
        }
      };
    });
  }, []);

  const handleOpenPort = React.useCallback(
    (payload: {
      containerName: string;
      containerId: string;
      port: string | number;
      protocol: string;
    }) => {
      postMessage({
        command: "openPort",
        containerName: payload.containerName,
        containerId: payload.containerId,
        port: payload.port,
        protocol: payload.protocol
      });
    },
    [postMessage]
  );

  return (
    <MuiThemeProvider>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "hidden",
          bgcolor: "background.default"
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap"
          }}
        >
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            Containerlab Inspect
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 260 }}>
            <TextField
              fullWidth
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
              placeholder="Search labs or nodes"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  )
                }
              }}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshIcon fontSize="small" />}
              onClick={() => {
                postMessage({ command: "refresh" });
              }}
            >
              Refresh
            </Button>
          </Stack>
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
          {!hasData ? (
            <Alert severity="info" variant="outlined">
              No containers found.
            </Alert>
          ) : null}

          <Stack spacing={2}>
            {filteredGroups.map((group) => (
              <InspectGroupPanel
                key={group.labName}
                group={group}
                activeSort={sortByLab[group.labName]}
                onToggleSort={handleToggleSort}
                onOpenPort={handleOpenPort}
              />
            ))}
          </Stack>
        </Box>
      </Box>
    </MuiThemeProvider>
  );
}

function bootstrapInspectWebview(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Inspect webview root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <InspectApp />
    </React.StrictMode>
  );
}

bootstrapInspectWebview();
