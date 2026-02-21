import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";

import { MuiThemeProvider } from "../../reactTopoViewer/webview/theme";
import { useMessageListener, usePostMessage } from "../shared/hooks";

import type { NetemDataMap, NetemFields, NodeImpairmentsInitialData } from "./types";

type NodeImpairmentsOutgoingMessage =
  | { command: "apply"; data: NetemDataMap }
  | { command: "clearAll" }
  | { command: "refresh" };

interface NodeImpairmentsUpdateMessage {
  command: "updateFields";
  data?: Record<string, Partial<NetemFields>>;
}

type NodeImpairmentsIncomingMessage = NodeImpairmentsUpdateMessage;

const FIELD_META: ReadonlyArray<{
  key: keyof NetemFields;
  label: string;
  unit: string;
  placeholder: string;
  inputType: "text" | "number";
}> = [
  { key: "delay", label: "Delay", unit: "ms/s/m", placeholder: "50", inputType: "text" },
  { key: "jitter", label: "Jitter", unit: "ms/s", placeholder: "10", inputType: "text" },
  { key: "loss", label: "Loss", unit: "%", placeholder: "0", inputType: "text" },
  { key: "rate", label: "Rate-limit", unit: "kb/s", placeholder: "1000", inputType: "number" },
  {
    key: "corruption",
    label: "Corruption",
    unit: "%",
    placeholder: "0",
    inputType: "text",
  },
];

function normalizeNetemFields(fields?: unknown): NetemFields {
  const readField = (key: keyof NetemFields): string => {
    if (typeof fields !== "object" || fields === null) {
      return "";
    }
    const value: unknown = Reflect.get(fields, key);
    return typeof value === "string" ? value : "";
  };

  return {
    delay: readField("delay"),
    jitter: readField("jitter"),
    loss: readField("loss"),
    rate: readField("rate"),
    corruption: readField("corruption"),
  };
}

function normalizeNetemMap(data?: unknown): NetemDataMap {
  const normalized: NetemDataMap = {};
  if (typeof data !== "object" || data === null) {
    return normalized;
  }
  for (const [iface, fields] of Object.entries(data)) {
    normalized[iface] = normalizeNetemFields(fields);
  }
  return normalized;
}

function parseInitialData(value: unknown): NodeImpairmentsInitialData {
  const nodeNameRaw: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "nodeName") : undefined;
  const interfacesDataRaw: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "interfacesData") : undefined;
  return {
    nodeName: typeof nodeNameRaw === "string" ? nodeNameRaw : "",
    interfacesData: normalizeNetemMap(interfacesDataRaw),
  };
}

function hasDelayValidationError(fields: NetemFields): boolean {
  const jitter = Number.parseFloat(fields.jitter) || 0;
  const delay = Number.parseFloat(fields.delay) || 0;
  return jitter > 0 && delay <= 0;
}

function NodeImpairmentsApp(): React.JSX.Element {
  const initialData = parseInitialData(window.__INITIAL_DATA__);
  const nodeName = initialData.nodeName;

  const postMessage = usePostMessage<NodeImpairmentsOutgoingMessage>();

  const [netemByInterface, setNetemByInterface] = React.useState<NetemDataMap>(() =>
    normalizeNetemMap(initialData.interfacesData)
  );

  const sortedInterfaces = React.useMemo(
    () => Object.keys(netemByInterface).sort((left, right) => left.localeCompare(right)),
    [netemByInterface]
  );

  useMessageListener<NodeImpairmentsIncomingMessage>((message) => {
    setNetemByInterface(normalizeNetemMap(message.data));
  });

  const updateField = React.useCallback(
    (iface: string, field: keyof NetemFields, nextValue: string) => {
      setNetemByInterface((current) => {
        const currentFields = current[iface] ?? normalizeNetemFields();
        return {
          ...current,
          [iface]: {
            ...currentFields,
            [field]: nextValue,
          },
        };
      });
    },
    []
  );

  return (
    <MuiThemeProvider>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          p: 2,
          bgcolor: "background.default",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            Link Impairments: {nodeName}
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => {
                postMessage({ command: "apply", data: netemByInterface });
              }}
            >
              Apply
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                postMessage({ command: "clearAll" });
              }}
            >
              Clear All
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                postMessage({ command: "refresh" });
              }}
            >
              Refresh
            </Button>
          </Stack>
        </Paper>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", mt: 2 }}>
          {sortedInterfaces.length === 0 ? (
            <Alert severity="info" variant="outlined">
              No interfaces available for this node.
            </Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: "100%" }}>
              <Table
                stickyHeader
                size="small"
                aria-label={`Link impairments table for ${nodeName}`}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>Interface</TableCell>
                    {FIELD_META.map((field) => (
                      <TableCell key={field.key} sx={{ whiteSpace: "nowrap" }}>
                        {field.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedInterfaces.map((iface) => {
                    const fields = netemByInterface[iface];
                    const hasValidationError = hasDelayValidationError(fields);

                    return (
                      <TableRow key={iface} hover>
                        <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                          {iface}
                        </TableCell>
                        {FIELD_META.map((field) => {
                          const showDelayMessage = field.key === "delay" && hasValidationError;
                          const isErrorField =
                            hasValidationError && (field.key === "delay" || field.key === "jitter");

                          return (
                            <TableCell key={`${iface}-${field.key}`} sx={{ minWidth: 148 }}>
                              <TextField
                                fullWidth
                                type={field.inputType}
                                value={fields[field.key]}
                                placeholder={field.placeholder}
                                error={isErrorField}
                                helperText={
                                  showDelayMessage
                                    ? "A positive delay is required if jitter is set."
                                    : " "
                                }
                                onChange={(event) => {
                                  updateField(iface, field.key, event.target.value);
                                }}
                                slotProps={{
                                  input: {
                                    endAdornment: (
                                      <InputAdornment position="end">{field.unit}</InputAdornment>
                                    ),
                                  },
                                }}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>
    </MuiThemeProvider>
  );
}

function bootstrapNodeImpairmentsWebview(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Node impairments root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <NodeImpairmentsApp />
    </React.StrictMode>
  );
}

bootstrapNodeImpairmentsWebview();
