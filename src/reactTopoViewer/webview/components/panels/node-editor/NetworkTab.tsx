/**
 * Network Tab for Node Editor
 */
import React from "react";

import { FormField, InputField, SelectField, DynamicList } from "../../ui/form";

import type { TabProps } from "./types";

/** Helper to check if a property is inherited */
const isInherited = (prop: string, inheritedProps: string[] = []) => inheritedProps.includes(prop);

const NETWORK_MODE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "bridge", label: "Bridge" },
  { value: "host", label: "Host" },
  { value: "none", label: "None" },
  { value: "container", label: "Container" }
];

export const NetworkTab: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <div className="space-y-3">
    {/* Management IPv4 */}
    <FormField label="Management IPv4" inherited={isInherited("mgmt-ipv4", inheritedProps)}>
      <InputField
        id="node-mgmt-ipv4"
        value={data.mgmtIpv4 || ""}
        onChange={(value) => onChange({ mgmtIpv4: value })}
        placeholder="e.g., 172.20.20.100"
      />
    </FormField>

    {/* Management IPv6 */}
    <FormField label="Management IPv6" inherited={isInherited("mgmt-ipv6", inheritedProps)}>
      <InputField
        id="node-mgmt-ipv6"
        value={data.mgmtIpv6 || ""}
        onChange={(value) => onChange({ mgmtIpv6: value })}
        placeholder="e.g., 2001:db8::100"
      />
    </FormField>

    {/* Network Mode */}
    <FormField label="Network Mode" inherited={isInherited("network-mode", inheritedProps)}>
      <SelectField
        id="node-network-mode"
        value={data.networkMode || ""}
        onChange={(value) => onChange({ networkMode: value })}
        options={NETWORK_MODE_OPTIONS}
      />
    </FormField>

    {/* Port Mappings */}
    <FormField label="Port Mappings" inherited={isInherited("ports", inheritedProps)}>
      <DynamicList
        items={data.ports || []}
        onChange={(items) => onChange({ ports: items })}
        placeholder="host:container[/protocol]"
        addLabel="Add Port"
      />
    </FormField>

    {/* DNS Servers */}
    <FormField label="DNS Servers" inherited={isInherited("dns", inheritedProps)}>
      <DynamicList
        items={data.dnsServers || []}
        onChange={(items) => onChange({ dnsServers: items })}
        placeholder="DNS server address"
        addLabel="Add DNS Server"
      />
    </FormField>

    {/* Network Aliases */}
    <FormField label="Network Aliases" inherited={isInherited("aliases", inheritedProps)}>
      <DynamicList
        items={data.aliases || []}
        onChange={(items) => onChange({ aliases: items })}
        placeholder="Alias name"
        addLabel="Add Alias"
      />
    </FormField>
  </div>
);
