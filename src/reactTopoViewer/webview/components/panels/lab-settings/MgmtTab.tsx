/**
 * MgmtTab - Management network settings tab for Lab Settings panel
 */
import React from 'react';
import type { IpType, DriverOption } from './types';

interface MgmtTabProps {
  networkName: string;
  ipv4Type: IpType;
  ipv4Subnet: string;
  ipv4Gateway: string;
  ipv4Range: string;
  ipv6Type: IpType;
  ipv6Subnet: string;
  ipv6Gateway: string;
  mtu: string;
  bridge: string;
  externalAccess: boolean;
  driverOptions: DriverOption[];
  isViewMode: boolean;
  onNetworkNameChange: (value: string) => void;
  onIpv4TypeChange: (value: IpType) => void;
  onIpv4SubnetChange: (value: string) => void;
  onIpv4GatewayChange: (value: string) => void;
  onIpv4RangeChange: (value: string) => void;
  onIpv6TypeChange: (value: IpType) => void;
  onIpv6SubnetChange: (value: string) => void;
  onIpv6GatewayChange: (value: string) => void;
  onMtuChange: (value: string) => void;
  onBridgeChange: (value: string) => void;
  onExternalAccessChange: (value: boolean) => void;
  onAddDriverOption: () => void;
  onRemoveDriverOption: (index: number) => void;
  onUpdateDriverOption: (index: number, field: 'key' | 'value', value: string) => void;
}

/** IPv4 settings section */
const Ipv4Section: React.FC<Pick<MgmtTabProps,
  'ipv4Type' | 'ipv4Subnet' | 'ipv4Gateway' | 'ipv4Range' | 'isViewMode' |
  'onIpv4TypeChange' | 'onIpv4SubnetChange' | 'onIpv4GatewayChange' | 'onIpv4RangeChange'
>> = (props) => (
  <div className="form-group">
    <label className="block vscode-label mb-1">IPv4 Subnet</label>
    <select
      className="input-field w-full mb-2"
      value={props.ipv4Type}
      onChange={(e) => props.onIpv4TypeChange(e.target.value as IpType)}
      disabled={props.isViewMode}
    >
      <option value="default">Default (172.20.20.0/24)</option>
      <option value="auto">Auto-assign</option>
      <option value="custom">Custom</option>
    </select>
    {props.ipv4Type === 'custom' && (
      <>
        <input type="text" className="input-field w-full mb-2" placeholder="e.g., 172.100.100.0/24"
          value={props.ipv4Subnet} onChange={(e) => props.onIpv4SubnetChange(e.target.value)} disabled={props.isViewMode} />
        <div className="form-group">
          <label className="block vscode-label mb-1">IPv4 Gateway</label>
          <input type="text" className="input-field w-full" placeholder="e.g., 172.100.100.1"
            value={props.ipv4Gateway} onChange={(e) => props.onIpv4GatewayChange(e.target.value)} disabled={props.isViewMode} />
        </div>
        <div className="form-group">
          <label className="block vscode-label mb-1">IPv4 Range</label>
          <input type="text" className="input-field w-full" placeholder="e.g., 172.100.100.128/25"
            value={props.ipv4Range} onChange={(e) => props.onIpv4RangeChange(e.target.value)} disabled={props.isViewMode} />
        </div>
      </>
    )}
  </div>
);

/** IPv6 settings section */
const Ipv6Section: React.FC<Pick<MgmtTabProps,
  'ipv6Type' | 'ipv6Subnet' | 'ipv6Gateway' | 'isViewMode' |
  'onIpv6TypeChange' | 'onIpv6SubnetChange' | 'onIpv6GatewayChange'
>> = (props) => (
  <div className="form-group">
    <label className="block vscode-label mb-1">IPv6 Subnet</label>
    <select
      className="input-field w-full mb-2"
      value={props.ipv6Type}
      onChange={(e) => props.onIpv6TypeChange(e.target.value as IpType)}
      disabled={props.isViewMode}
    >
      <option value="default">Default (3fff:172:20:20::/64)</option>
      <option value="auto">Auto-assign</option>
      <option value="custom">Custom</option>
    </select>
    {props.ipv6Type === 'custom' && (
      <>
        <input type="text" className="input-field w-full mb-2" placeholder="e.g., 3fff:172:100:100::/80"
          value={props.ipv6Subnet} onChange={(e) => props.onIpv6SubnetChange(e.target.value)} disabled={props.isViewMode} />
        <div className="form-group">
          <label className="block vscode-label mb-1">IPv6 Gateway</label>
          <input type="text" className="input-field w-full" placeholder="e.g., 3fff:172:100:100::1"
            value={props.ipv6Gateway} onChange={(e) => props.onIpv6GatewayChange(e.target.value)} disabled={props.isViewMode} />
        </div>
      </>
    )}
  </div>
);

/** Driver options section */
const DriverOptionsSection: React.FC<Pick<MgmtTabProps,
  'driverOptions' | 'isViewMode' | 'onAddDriverOption' | 'onRemoveDriverOption' | 'onUpdateDriverOption'
>> = (props) => (
  <div className="form-group">
    <label className="block vscode-label mb-1">Bridge Driver Options</label>
    <div className="space-y-2">
      {props.driverOptions.map((opt, idx) => (
        <div key={idx} className="flex gap-2">
          <input type="text" className="input-field flex-1" placeholder="Option key"
            value={opt.key} onChange={(e) => props.onUpdateDriverOption(idx, 'key', e.target.value)} disabled={props.isViewMode} />
          <input type="text" className="input-field flex-1" placeholder="Option value"
            value={opt.value} onChange={(e) => props.onUpdateDriverOption(idx, 'value', e.target.value)} disabled={props.isViewMode} />
          {!props.isViewMode && (
            <button type="button" className="btn-icon" onClick={() => props.onRemoveDriverOption(idx)} title="Remove option">
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
          )}
        </div>
      ))}
    </div>
    {!props.isViewMode && (
      <button type="button" className="btn btn-small mt-2" onClick={props.onAddDriverOption}>
        <i className="fas fa-plus mr-1" aria-hidden="true"></i>
        Add Option
      </button>
    )}
  </div>
);

export const MgmtTab: React.FC<MgmtTabProps> = (props) => {
  return (
    <div className="space-y-3">
      {/* Network Name */}
      <div className="form-group">
        <label className="block vscode-label mb-1">Network Name</label>
        <input type="text" className="input-field w-full" placeholder="clab"
          value={props.networkName} onChange={(e) => props.onNetworkNameChange(e.target.value)} disabled={props.isViewMode} />
        <small className="text-secondary text-xs">Docker network name (default: clab)</small>
      </div>

      <Ipv4Section {...props} />
      <Ipv6Section {...props} />

      {/* MTU */}
      <div className="form-group">
        <label className="block vscode-label mb-1">MTU</label>
        <input type="number" className="input-field w-full" placeholder="Default: auto"
          value={props.mtu} onChange={(e) => props.onMtuChange(e.target.value)} disabled={props.isViewMode} />
        <small className="text-secondary text-xs">MTU size (defaults to docker0 interface MTU)</small>
      </div>

      {/* Bridge Name */}
      <div className="form-group">
        <label className="block vscode-label mb-1">Bridge Name</label>
        <input type="text" className="input-field w-full" placeholder="Default: auto"
          value={props.bridge} onChange={(e) => props.onBridgeChange(e.target.value)} disabled={props.isViewMode} />
        <small className="text-secondary text-xs">Custom Linux bridge name (default: br-&lt;network-id&gt;)</small>
      </div>

      {/* External Access */}
      <div className="form-group">
        <div className="flex items-center">
          <input type="checkbox" id="mgmt-external-access" className="vscode-checkbox mr-2"
            checked={props.externalAccess} onChange={(e) => props.onExternalAccessChange(e.target.checked)} disabled={props.isViewMode} />
          <label htmlFor="mgmt-external-access" className="checkbox-label">Enable External Access</label>
        </div>
        <small className="text-secondary text-xs">Allow external systems to reach lab nodes</small>
      </div>

      <DriverOptionsSection {...props} />
    </div>
  );
};
