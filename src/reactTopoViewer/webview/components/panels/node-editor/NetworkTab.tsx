/**
 * Network Tab for Node Editor
 */
import React from 'react';
import { TabProps } from './types';
import { FormField, InputField, SelectField, DynamicList } from '../../shared/form';

const NETWORK_MODE_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'host', label: 'Host' },
  { value: 'none', label: 'None' },
  { value: 'container', label: 'Container' }
];

export const NetworkTab: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="space-y-3">
    {/* Management IPv4 */}
    <FormField label="Management IPv4">
      <InputField
        id="node-mgmt-ipv4"
        value={data.mgmtIpv4 || ''}
        onChange={(value) => onChange({ mgmtIpv4: value })}
        placeholder="e.g., 172.20.20.100"
      />
    </FormField>

    {/* Management IPv6 */}
    <FormField label="Management IPv6">
      <InputField
        id="node-mgmt-ipv6"
        value={data.mgmtIpv6 || ''}
        onChange={(value) => onChange({ mgmtIpv6: value })}
        placeholder="e.g., 2001:db8::100"
      />
    </FormField>

    {/* Network Mode */}
    <FormField label="Network Mode">
      <SelectField
        id="node-network-mode"
        value={data.networkMode || ''}
        onChange={(value) => onChange({ networkMode: value })}
        options={NETWORK_MODE_OPTIONS}
      />
    </FormField>

    {/* Port Mappings */}
    <FormField label="Port Mappings">
      <DynamicList
        items={data.ports || []}
        onChange={(items) => onChange({ ports: items })}
        placeholder="host:container[/protocol]"
        addLabel="Add Port"
      />
    </FormField>

    {/* DNS Servers */}
    <FormField label="DNS Servers">
      <DynamicList
        items={data.dnsServers || []}
        onChange={(items) => onChange({ dnsServers: items })}
        placeholder="DNS server address"
        addLabel="Add DNS Server"
      />
    </FormField>

    {/* Network Aliases */}
    <FormField label="Network Aliases">
      <DynamicList
        items={data.aliases || []}
        onChange={(items) => onChange({ aliases: items })}
        placeholder="Alias name"
        addLabel="Add Alias"
      />
    </FormField>
  </div>
);
