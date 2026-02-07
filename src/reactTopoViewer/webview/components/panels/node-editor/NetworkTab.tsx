/**
 * Network Tab for Node Editor
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { InputField, SelectField, DynamicList } from "../../ui/form";

import type { TabProps } from "./types";

const NETWORK_MODE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "bridge", label: "Bridge" },
  { value: "host", label: "Host" },
  { value: "none", label: "None" },
  { value: "container", label: "Container" }
];

export const NetworkTab: React.FC<TabProps> = ({ data, onChange }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <InputField
      id="node-mgmt-ipv4"
      label="Management IPv4"
      value={data.mgmtIpv4 || ""}
      onChange={(value) => onChange({ mgmtIpv4: value })}
      placeholder="e.g., 172.20.20.100"
    />

    <InputField
      id="node-mgmt-ipv6"
      label="Management IPv6"
      value={data.mgmtIpv6 || ""}
      onChange={(value) => onChange({ mgmtIpv6: value })}
      placeholder="e.g., 2001:db8::100"
    />

    <SelectField
      id="node-network-mode"
      label="Network Mode"
      value={data.networkMode || ""}
      onChange={(value) => onChange({ networkMode: value })}
      options={NETWORK_MODE_OPTIONS}
    />

    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        Port Mappings
      </Typography>
      <DynamicList
        items={data.ports || []}
        onChange={(items) => onChange({ ports: items })}
        placeholder="host:container[/protocol]"
        addLabel="Add Port"
      />
    </Box>

    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        DNS Servers
      </Typography>
      <DynamicList
        items={data.dnsServers || []}
        onChange={(items) => onChange({ dnsServers: items })}
        placeholder="DNS server address"
        addLabel="Add DNS Server"
      />
    </Box>

    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        Network Aliases
      </Typography>
      <DynamicList
        items={data.aliases || []}
        onChange={(items) => onChange({ aliases: items })}
        placeholder="Alias name"
        addLabel="Add Alias"
      />
    </Box>
  </Box>
);
