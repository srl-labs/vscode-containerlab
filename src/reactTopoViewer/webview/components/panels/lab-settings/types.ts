/**
 * Types for Lab Settings Panel
 */

export interface LabSettings {
  name?: string;
  prefix?: string | null;
  mgmt?: MgmtSettings | null;
}

export interface MgmtSettings {
  network?: string;
  'ipv4-subnet'?: string;
  'ipv4-gw'?: string;
  'ipv4-range'?: string;
  'ipv6-subnet'?: string;
  'ipv6-gw'?: string;
  mtu?: number;
  bridge?: string;
  'external-access'?: boolean;
  'driver-opts'?: Record<string, string>;
}

export type PrefixType = 'default' | 'custom' | 'no-prefix';
export type IpType = 'default' | 'auto' | 'custom';
export type TabId = 'basic-lab' | 'mgmt';

export interface DriverOption {
  key: string;
  value: string;
}

export interface BasicSettingsState {
  labName: string;
  prefixType: PrefixType;
  customPrefix: string;
}

export interface MgmtSettingsState {
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
}
