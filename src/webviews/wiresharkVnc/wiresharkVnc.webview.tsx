import { Alert, Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";

import { MuiThemeProvider } from "../../reactTopoViewer/webview/theme";
import { usePostMessage } from "../shared/hooks";

import type { WiresharkVncInitialData } from "./types";

type WiresharkVncOutgoingMessage = { type: "retry-check" };

interface VncProgressMessage {
  type: "vnc-progress";
  attempt?: number;
  maxAttempts?: number;
}

interface VncReadyMessage {
  type: "vnc-ready";
  url?: string;
}

interface VncTimeoutMessage {
  type: "vnc-timeout";
  url?: string;
}

type WiresharkVncIncomingMessage = VncProgressMessage | VncReadyMessage | VncTimeoutMessage;

function appendCacheBuster(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

function WiresharkVncApp(): React.JSX.Element {
  const initialData = (window.__INITIAL_DATA__ ?? {}) as unknown as WiresharkVncInitialData;
  const fallbackUrl = initialData.iframeUrl || "";
  const showVolumeTip = Boolean(initialData.showVolumeTip);

  const postMessage = usePostMessage<WiresharkVncOutgoingMessage>();

  const latestUrlRef = React.useRef(fallbackUrl);
  const pendingRetryRef = React.useRef(false);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isFrameVisible, setIsFrameVisible] = React.useState(false);
  const [iframeSrc, setIframeSrc] = React.useState("");
  const [retryInfo, setRetryInfo] = React.useState("");

  const loadVnc = React.useCallback(
    (url?: string, forceReload = false) => {
      const nextUrl = (url || latestUrlRef.current || fallbackUrl).trim();
      if (!nextUrl) {
        return;
      }

      latestUrlRef.current = nextUrl;
      const targetUrl = forceReload ? appendCacheBuster(nextUrl) : nextUrl;
      setIsLoading(true);
      setIsFrameVisible(false);
      setIframeSrc(targetUrl);
    },
    [fallbackUrl]
  );

  React.useEffect(() => {
    const listener = (event: MessageEvent<WiresharkVncIncomingMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }

      switch (message.type) {
        case "vnc-progress": {
          pendingRetryRef.current = false;
          const attempt = typeof message.attempt === "number" ? message.attempt : 0;
          const maxAttempts = typeof message.maxAttempts === "number" ? message.maxAttempts : 0;

          if (attempt <= 1) {
            setRetryInfo("Waiting for VNC server...");
          } else if (maxAttempts > 0) {
            setRetryInfo(`Waiting for VNC server... (attempt ${attempt}/${maxAttempts})`);
          } else {
            setRetryInfo(`Waiting for VNC server... (attempt ${attempt})`);
          }

          break;
        }
        case "vnc-ready": {
          pendingRetryRef.current = false;
          setRetryInfo("VNC server ready, loading...");
          loadVnc(message.url, false);
          break;
        }
        case "vnc-timeout": {
          pendingRetryRef.current = false;
          setRetryInfo("Connection timeout - attempting to load anyway...");
          loadVnc(message.url, true);
          break;
        }
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [loadVnc]);

  React.useEffect(() => {
    postMessage({ type: "retry-check" });
  }, [postMessage]);

  return (
    <MuiThemeProvider>
      <Box sx={{ position: "relative", width: "100%", height: "100%", bgcolor: "background.default" }}>
        <Box
          component="iframe"
          title="Wireshark VNC"
          src={iframeSrc || undefined}
          onLoad={() => {
            setIsLoading(false);
            setIsFrameVisible(true);
            setRetryInfo("");
            pendingRetryRef.current = false;
          }}
          onError={() => {
            setIsLoading(true);
            setIsFrameVisible(false);
            setRetryInfo("Connection failed - retrying...");

            if (!pendingRetryRef.current) {
              pendingRetryRef.current = true;
              postMessage({ type: "retry-check" });
            }
          }}
          sx={{
            border: 0,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: isFrameVisible ? "block" : "none"
          }}
        />

        {isLoading ? (
          <Stack
            sx={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              p: 2,
              textAlign: "center"
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                px: 3,
                py: 2.5,
                maxWidth: 460,
                bgcolor: (theme) => theme.alpha(theme.palette.background.paper, 0.92)
              }}
            >
              <Stack spacing={1.5} alignItems="center">
                <CircularProgress size={24} />
                <Typography variant="subtitle1">Loading Wireshark...</Typography>
                {showVolumeTip ? (
                  <Alert severity="info" variant="outlined" sx={{ textAlign: "left" }}>
                    Tip: Save pcap files to `/pcaps` to persist them in the lab directory.
                  </Alert>
                ) : null}
                {retryInfo ? (
                  <Typography variant="caption" color="text.secondary">
                    {retryInfo}
                  </Typography>
                ) : null}
              </Stack>
            </Paper>
          </Stack>
        ) : null}
      </Box>
    </MuiThemeProvider>
  );
}

function bootstrapWiresharkVncWebview(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Wireshark VNC root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <WiresharkVncApp />
    </React.StrictMode>
  );
}

bootstrapWiresharkVncWebview();
