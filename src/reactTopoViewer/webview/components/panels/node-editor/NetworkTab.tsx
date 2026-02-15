// Network tab for node editor.
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { InputField, SelectField, DynamicList } from "../../ui/form";

import type { TabProps } from "./types";

const NETWORK_MODE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "bridge", label: "Bridge" },
  { value: "host", label: "Host" },
  { value: "none", label: "None" },
  { value: "container", label: "Container" }
];

export const NetworkTab: React.FC<TabProps> = ({ data, onChange }) => {
  const handleAddPort = () => {
    onChange({ ports: [...(data.ports || []), ""] });
  };

  const handleAddDns = () => {
    onChange({ dnsServers: [...(data.dnsServers || []), ""] });
  };

  const handleAddAlias = () => {
    onChange({ aliases: [...(data.aliases || []), ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Management Network */}
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Management Network</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
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
      </Box>

      {/* Port Mappings */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Port Mappings</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddPort} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.ports || []}
          onChange={(items) => onChange({ ports: items })}
          placeholder="host:container[/protocol]"
          hideAddButton
        />
      </Box>

      {/* DNS Servers */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">DNS Servers</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddDns} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.dnsServers || []}
          onChange={(items) => onChange({ dnsServers: items })}
          placeholder="DNS server address"
          hideAddButton
        />
      </Box>

      {/* Network Aliases */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Network Aliases</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddAlias} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.aliases || []}
          onChange={(items) => onChange({ aliases: items })}
          placeholder="Alias name"
          hideAddButton
        />
      </Box>
    </Box>
  );
};
