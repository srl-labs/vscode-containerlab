// Network tab for node editor.
import React from "react";
import Box from "@mui/material/Box";

import { InputField, SelectField, DynamicList, PanelAddSection, PanelSection } from "../../ui/form";

import type { TabProps } from "./types";

const NETWORK_MODE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "bridge", label: "Bridge" },
  { value: "host", label: "Host" },
  { value: "none", label: "None" },
  { value: "container", label: "Container" },
];

export const NetworkTab: React.FC<TabProps> = ({ data, onChange }) => {
  const handleAddPort = () => {
    onChange({ ports: [...(data.ports ?? []), ""] });
  };

  const handleAddDns = () => {
    onChange({ dnsServers: [...(data.dnsServers ?? []), ""] });
  };

  const handleAddAlias = () => {
    onChange({ aliases: [...(data.aliases ?? []), ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Management Network" withTopDivider={false}>
        <InputField
          id="node-mgmt-ipv4"
          label="Management IPv4"
          value={data.mgmtIpv4 ?? ""}
          onChange={(value) => onChange({ mgmtIpv4: value })}
          placeholder="e.g., 172.20.20.100"
        />
        <InputField
          id="node-mgmt-ipv6"
          label="Management IPv6"
          value={data.mgmtIpv6 ?? ""}
          onChange={(value) => onChange({ mgmtIpv6: value })}
          placeholder="e.g., 2001:db8::100"
        />
        <SelectField
          id="node-network-mode"
          label="Network Mode"
          value={data.networkMode ?? ""}
          onChange={(value) => onChange({ networkMode: value })}
          options={NETWORK_MODE_OPTIONS}
        />
      </PanelSection>

      <PanelAddSection title="Port Mappings" onAdd={handleAddPort}>
        <DynamicList
          items={data.ports ?? []}
          onChange={(items) => onChange({ ports: items })}
          placeholder="host:container[/protocol]"
          hideAddButton
        />
      </PanelAddSection>

      <PanelAddSection title="DNS Servers" onAdd={handleAddDns}>
        <DynamicList
          items={data.dnsServers ?? []}
          onChange={(items) => onChange({ dnsServers: items })}
          placeholder="DNS server address"
          hideAddButton
        />
      </PanelAddSection>

      <PanelAddSection title="Network Aliases" onAdd={handleAddAlias}>
        <DynamicList
          items={data.aliases ?? []}
          onChange={(items) => onChange({ aliases: items })}
          placeholder="Alias name"
          hideAddButton
        />
      </PanelAddSection>
    </Box>
  );
};
