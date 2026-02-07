/**
 * NodeInfoView - Node info content for the ContextPanel
 * Extracts the display content from NodeInfoPanel without the FloatingPanel wrapper.
 */
import React, { useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";

import type { NodeData } from "../../../../hooks/ui";

export interface NodeInfoViewProps {
  nodeData: NodeData | null;
}

function getNodeProperty(
  extraData: Record<string, unknown>,
  nodeData: NodeData,
  extraKey: string,
  topLevelKey: keyof NodeData
): string {
  return (extraData[extraKey] as string) || (nodeData[topLevelKey] as string) || "";
}

function extractNodeDisplayProps(nodeData: NodeData) {
  const extraData = (nodeData.extraData as Record<string, unknown>) || {};
  return {
    nodeName: nodeData.label || nodeData.name || nodeData.id || "Unknown",
    kind: getNodeProperty(extraData, nodeData, "kind", "kind"),
    state: getNodeProperty(extraData, nodeData, "state", "state"),
    image: getNodeProperty(extraData, nodeData, "image", "image"),
    mgmtIpv4: getNodeProperty(extraData, nodeData, "mgmtIpv4Address", "mgmtIpv4"),
    mgmtIpv6: getNodeProperty(extraData, nodeData, "mgmtIpv6Address", "mgmtIpv6"),
    fqdn: getNodeProperty(extraData, nodeData, "fqdn", "fqdn")
  };
}

const CopyableValue: React.FC<{ value: string; variant?: "body1" | "body2" | "h6"; mono?: boolean }> = ({
  value,
  variant = "body2",
  mono = false
}) => {
  const handleCopy = useCallback(() => {
    if (value) {
      window.navigator.clipboard.writeText(value).catch(() => {});
    }
  }, [value]);

  if (!value) {
    return (
      <Typography variant={variant} color="text.disabled">
        —
      </Typography>
    );
  }

  return (
    <Tooltip title="Click to copy" arrow placement="top">
      <Typography
        variant={variant}
        onClick={handleCopy}
        sx={{
          cursor: "pointer",
          fontFamily: mono ? "monospace" : undefined,
          borderRadius: 0.5,
          px: 0.5,
          mx: -0.5,
          "&:hover": { bgcolor: "action.hover" },
          "&:active": { bgcolor: "action.selected" },
          wordBreak: "break-all"
        }}
      >
        {value}
      </Typography>
    </Tooltip>
  );
};

const InfoRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  fullWidth?: boolean;
}> = ({ label, value, mono = false, fullWidth = false }) => (
  <Box sx={{ gridColumn: fullWidth ? "1 / -1" : undefined }}>
    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
      {label}
    </Typography>
    <CopyableValue value={value} mono={mono} />
  </Box>
);

function getStateColor(state: string): "success" | "error" | "default" {
  const lowerState = state.toLowerCase();
  if (lowerState === "running" || lowerState === "healthy") return "success";
  if (lowerState === "stopped" || lowerState === "exited") return "error";
  return "default";
}

const StateBadge: React.FC<{ state: string }> = ({ state }) => {
  if (!state) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }
  return <Chip label={state} size="small" color={getStateColor(state)} variant="outlined" sx={{ fontWeight: 500 }} />;
};

export const NodeInfoView: React.FC<NodeInfoViewProps> = ({ nodeData }) => {
  if (!nodeData) return null;

  const { nodeName, kind, state, image, mgmtIpv4, mgmtIpv6, fqdn } = extractNodeDisplayProps(nodeData);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
      <Box sx={{ pb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          Name
        </Typography>
        <CopyableValue value={nodeName} variant="h6" />
      </Box>

      <Divider />

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Kind
          </Typography>
          <CopyableValue value={kind} />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            State
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <StateBadge state={state} />
          </Box>
        </Box>
      </Box>

      <InfoRow label="Image" value={image} fullWidth />

      <Divider />

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <InfoRow label="Mgmt IPv4" value={mgmtIpv4} mono />
        <InfoRow label="Mgmt IPv6" value={mgmtIpv6} mono />
      </Box>

      <InfoRow label="FQDN" value={fqdn} fullWidth mono />
    </Box>
  );
};
