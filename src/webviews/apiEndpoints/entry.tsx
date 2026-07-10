import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import SettingsEthernetIcon from "@mui/icons-material/SettingsEthernet";

import { vscodeTheme } from "@srl-labs/clab-ui/theme";

import { isValidApiSessionDuration, type ApiEndpointProfileView } from "../../apiEndpoints/model";
import type {
  ApiEndpointManagerRequest,
  ApiEndpointManagerResponse,
  ApiEndpointManagerState,
  ApiEndpointManagerStateMessage
} from "../../apiEndpoints/protocol";

type RequestInput = ApiEndpointManagerRequest extends infer Request
  ? Request extends ApiEndpointManagerRequest
    ? Omit<Request, "type" | "requestId">
    : never
  : never;

interface PendingRequest {
  reject(error: Error): void;
  resolve(state: ApiEndpointManagerState): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is ApiEndpointManagerResponse {
  return (
    isRecord(value) &&
    value.type === "api-endpoints:response" &&
    typeof value.requestId === "string" &&
    typeof value.success === "boolean" &&
    isRecord(value.state)
  );
}

function isStateMessage(value: unknown): value is ApiEndpointManagerStateMessage {
  return isRecord(value) && value.type === "api-endpoints:state" && isRecord(value.state);
}

function statusLabel(status: ApiEndpointProfileView["status"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "session_expired":
      return "Session Expired";
    case "offline":
      return "Offline";
    case "saved":
      return "Saved";
  }
}

function statusColor(
  status: ApiEndpointProfileView["status"]
): "success" | "warning" | "error" | "info" {
  switch (status) {
    case "connected":
      return "success";
    case "session_expired":
      return "warning";
    case "offline":
      return "error";
    case "saved":
      return "info";
  }
}

function statusHint(endpoint: ApiEndpointProfileView): string {
  if (endpoint.registered && endpoint.connected) {
    return "Labs from this endpoint are available alongside local containerlab labs.";
  }
  switch (endpoint.status) {
    case "connected":
      return "Authenticated and ready to connect.";
    case "session_expired":
      return "Reconnect with your Linux account password.";
    case "offline":
      return "The endpoint could not be reached with the current TLS settings.";
    case "saved":
      return "Profile saved locally. Connect its stored session or reconnect with your password.";
  }
}

function useEndpointManagerApi() {
  const [state, setState] = useState<ApiEndpointManagerState | null>(null);
  const pending = useRef(new Map<string, PendingRequest>());

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isStateMessage(event.data)) {
        setState(event.data.state);
        return;
      }
      if (!isResponse(event.data)) return;
      setState(event.data.state);
      const request = pending.current.get(event.data.requestId);
      if (!request) return;
      pending.current.delete(event.data.requestId);
      if (event.data.success) request.resolve(event.data.state);
      else request.reject(new Error(event.data.error ?? "Endpoint operation failed."));
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      for (const request of pending.current.values()) {
        request.reject(new Error("Endpoint manager closed."));
      }
      pending.current.clear();
    };
  }, []);

  const send = useCallback((input: RequestInput): Promise<ApiEndpointManagerState> => {
    const requestId = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      if (window.vscode === undefined) {
        reject(new Error("The VS Code webview API is unavailable."));
        return;
      }
      pending.current.set(requestId, { resolve, reject });
      window.vscode.postMessage({
        type: "api-endpoints:request",
        requestId,
        ...input
      } satisfies ApiEndpointManagerRequest);
    });
  }, []);

  return { send, state };
}

function EndpointCard(props: {
  busy: boolean;
  endpoint: ApiEndpointProfileView;
  onConnect(endpoint: ApiEndpointProfileView): void;
  onEdit(endpoint: ApiEndpointProfileView): void;
  onReconnect(endpoint: ApiEndpointProfileView): void;
  onRemove(endpoint: ApiEndpointProfileView): void;
}) {
  const { endpoint } = props;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderColor: endpoint.registered ? "primary.main" : "divider" }}
    >
      <Stack spacing={1.5} divider={<Divider flexItem />}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle1" fontWeight={650} noWrap>
                {endpoint.label}
              </Typography>
              {endpoint.registered ? (
                <Chip
                  size="small"
                  color="primary"
                  icon={<CheckCircleOutlineIcon />}
                  label="Connected"
                />
              ) : null}
              <Chip
                size="small"
                color={statusColor(endpoint.status)}
                label={statusLabel(endpoint.status)}
              />
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontFamily: "monospace" }}
              noWrap
            >
              {endpoint.url}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {endpoint.username} · session {endpoint.sessionDuration}
            </Typography>
            {endpoint.certificateFingerprint !== undefined ? (
              <Typography
                variant="caption"
                color="success.main"
                sx={{ display: "block" }}
                title={`SHA-256 ${endpoint.certificateFingerprint}`}
              >
                TLS certificate pinned to this endpoint
              </Typography>
            ) : null}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {statusHint(endpoint)}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant={endpoint.registered ? "outlined" : "contained"}
            disabled={props.busy || endpoint.registered}
            onClick={() => props.onConnect(endpoint)}
          >
            {endpoint.registered ? "Connected" : "Connect"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={props.busy}
            onClick={() => props.onReconnect(endpoint)}
          >
            Reconnect
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            disabled={props.busy}
            onClick={() => props.onEdit(endpoint)}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={props.busy}
            onClick={() => props.onRemove(endpoint)}
          >
            Remove
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function EndpointManagerApp() {
  const { send, state } = useEndpointManagerApi();
  const [busy, setBusy] = useState<string | null>("refresh");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sessionDuration, setSessionDuration] = useState("24h");
  const [reconnect, setReconnect] = useState<ApiEndpointProfileView | null>(null);
  const [reconnectPassword, setReconnectPassword] = useState("");
  const [editing, setEditing] = useState<ApiEndpointProfileView | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDuration, setEditDuration] = useState("24h");
  const [removing, setRemoving] = useState<ApiEndpointProfileView | null>(null);

  useEffect(() => {
    void send({ action: "refresh" })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      )
      .finally(() => setBusy(null));
  }, [send]);

  useEffect(() => {
    if (url.length === 0 && (state?.defaultApiUrl.length ?? 0) > 0) {
      setUrl(state?.defaultApiUrl ?? "");
    }
  }, [state?.defaultApiUrl, url]);

  const perform = useCallback(
    async (key: string, request: RequestInput, successMessage: string): Promise<boolean> => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        await send(request);
        setNotice(successMessage);
        return true;
      } catch (operationError) {
        setError(operationError instanceof Error ? operationError.message : String(operationError));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [send]
  );

  const submitAdd = useCallback(async () => {
    const success = await perform(
      "add",
      {
        action: "add",
        input: {
          url,
          label: label.trim().length > 0 ? label : undefined,
          username,
          password,
          sessionDuration
        }
      },
      "Endpoint connected."
    );
    if (success) {
      setLabel("");
      setPassword("");
    }
  }, [label, password, perform, sessionDuration, url, username]);

  if (!state) {
    return (
      <Stack height="100%" alignItems="center" justifyContent="center" spacing={2}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading API endpoints…</Typography>
      </Stack>
    );
  }

  const durationValid = isValidApiSessionDuration(sessionDuration);
  const addDisabled =
    busy !== null ||
    url.trim().length === 0 ||
    username.trim().length === 0 ||
    password.length === 0 ||
    !durationValid;

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5} sx={{ maxWidth: 980, mx: "auto", pb: 4 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            clab-api-server Endpoints
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connect one or more API servers alongside the local containerlab runtime. Passwords are
            used only for login; JWTs remain in VS Code SecretStorage.
          </Typography>
        </Box>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ sm: "center" }}
          >
            <SecurityIcon color={state.tlsVerify ? "success" : "warning"} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">
                TLS verification {state.tlsVerify ? "enabled" : "disabled"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {state.tlsCaPath !== undefined && state.tlsCaPath.length > 0
                  ? `Additional CA: ${state.tlsCaPath}`
                  : "Using operating-system trust roots and endpoint certificates approved on first connection."}{" "}
                TLS policy is machine-scoped; pinned certificates are isolated per endpoint.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={() => {
                setError(null);
                void send({ action: "openTlsSettings" }).catch((settingsError: unknown) =>
                  setError(
                    settingsError instanceof Error ? settingsError.message : String(settingsError)
                  )
                );
              }}
            >
              TLS Settings
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={busy !== null}
              onClick={() => {
                setBusy("refresh");
                setError(null);
                void send({ action: "refresh" })
                  .catch((refreshError: unknown) =>
                    setError(
                      refreshError instanceof Error ? refreshError.message : String(refreshError)
                    )
                  )
                  .finally(() => setBusy(null));
              }}
            >
              Refresh
            </Button>
          </Stack>
        </Paper>

        {error !== null ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        {state.configurationError !== undefined ? (
          <Alert severity="error">{state.configurationError}</Alert>
        ) : null}
        {notice !== null ? (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}

        {state.endpoints.length > 0 ? (
          <Stack spacing={1.25}>
            {state.endpoints.map((endpoint) => (
              <EndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                busy={busy !== null}
                onConnect={(selected) => {
                  void perform(
                    `connect:${selected.id}`,
                    { action: "connect", endpointId: selected.id },
                    `${selected.label} is connected.`
                  );
                }}
                onReconnect={(selected) => {
                  setReconnect(selected);
                  setReconnectPassword("");
                }}
                onEdit={(selected) => {
                  setEditing(selected);
                  setEditLabel(selected.label);
                  setEditDuration(selected.sessionDuration);
                }}
                onRemove={setRemoving}
              />
            ))}
          </Stack>
        ) : (
          <Alert severity="info">No API endpoint profiles are saved yet.</Alert>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Add Endpoint</Typography>
              <Typography variant="body2" color="text.secondary">
                A successful login saves and connects the endpoint without replacing local mode.
              </Typography>
            </Box>
            <TextField
              label="API Endpoint"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://localhost:8090"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SettingsEthernetIcon />
                    </InputAdornment>
                  )
                }
              }}
            />
            <TextField
              label="Label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Optional friendly name"
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LabelOutlinedIcon />
                    </InputAdornment>
                  )
                }
              }}
            />
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon />
                    </InputAdornment>
                  )
                }
              }}
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon />
                    </InputAdornment>
                  )
                }
              }}
            />
            <TextField
              label="Keep signed in"
              value={sessionDuration}
              onChange={(event) => setSessionDuration(event.target.value)}
              error={Boolean(sessionDuration.trim()) && !durationValid}
              helperText={
                durationValid ? "Examples: 24h, 36h, 7d, 1h30m" : "Enter a valid duration."
              }
              fullWidth
            />
            <Button
              variant="contained"
              size="large"
              disabled={addDisabled}
              onClick={() => void submitAdd()}
            >
              {busy === "add" ? "Connecting…" : "Add and Connect"}
            </Button>
          </Stack>
        </Paper>
      </Stack>

      <Dialog
        open={reconnect !== null}
        onClose={() => busy === null && setReconnect(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Reconnect {reconnect?.label}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Username" value={reconnect?.username ?? ""} fullWidth disabled />
            <TextField
              label="Password"
              type="password"
              value={reconnectPassword}
              onChange={(event) => setReconnectPassword(event.target.value)}
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReconnect(null)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy !== null || !reconnectPassword}
            onClick={() => {
              if (!reconnect) return;
              void perform(
                `reconnect:${reconnect.id}`,
                {
                  action: "reconnect",
                  input: { endpointId: reconnect.id, password: reconnectPassword }
                },
                `${reconnect.label} reconnected.`
              ).then((success) => {
                if (success) {
                  setReconnect(null);
                  setReconnectPassword("");
                }
              });
            }}
          >
            Reconnect
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => busy === null && setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit {editing?.label}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Label"
              value={editLabel}
              onChange={(event) => setEditLabel(event.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Keep signed in"
              value={editDuration}
              onChange={(event) => setEditDuration(event.target.value)}
              error={Boolean(editDuration.trim()) && !isValidApiSessionDuration(editDuration)}
              helperText="Applied the next time this profile reconnects."
              fullWidth
            />
            <Alert severity="info">
              Endpoint URL and account identity are immutable. Remove and add a new profile to
              change them.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              busy !== null || !editLabel.trim() || !isValidApiSessionDuration(editDuration)
            }
            onClick={() => {
              if (!editing) return;
              void perform(
                `update:${editing.id}`,
                {
                  action: "update",
                  input: { endpointId: editing.id, label: editLabel, sessionDuration: editDuration }
                },
                `${editLabel.trim()} updated.`
              ).then((success) => {
                if (success) setEditing(null);
              });
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => busy === null && setRemoving(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Remove endpoint?</DialogTitle>
        <DialogContent>
          <Typography>
            Remove {removing?.label}? Its JWT will be deleted from SecretStorage and its labs will
            disappear from this window. Local labs and other connected endpoints are unaffected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)} disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy !== null}
            onClick={() => {
              if (!removing) return;
              void perform(
                `remove:${removing.id}`,
                { action: "remove", endpointId: removing.id },
                `${removing.label} removed.`
              ).then((success) => {
                if (success) setRemoving(null);
              });
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("API endpoint manager root element not found.");
createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={vscodeTheme}>
      <CssBaseline enableColorScheme />
      <EndpointManagerApp />
    </ThemeProvider>
  </React.StrictMode>
);
