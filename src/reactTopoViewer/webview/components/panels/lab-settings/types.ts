/**
 * Types for Lab Settings Panel
 */
import type {
  LabSettings as SharedLabSettings,
  MgmtSettings as SharedMgmtSettings
} from "../../../../shared/types/labSettings";

export type LabSettings = SharedLabSettings;
export type MgmtSettings = SharedMgmtSettings;

export type PrefixType = "default" | "custom" | "no-prefix";
export type IpType = "default" | "auto" | "custom";
export type TabId = "basic-lab" | "mgmt";

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
