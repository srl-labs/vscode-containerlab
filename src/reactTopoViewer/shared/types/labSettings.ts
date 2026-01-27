/**
 * Shared Lab Settings types.
 *
 * These reflect Containerlab's top-level "name", "prefix", and "mgmt" fields.
 * Kept in shared/types so both extension host and webview can use the same shape.
 */

export interface LabSettings {
  name?: string;
  prefix?: string | null;
  mgmt?: MgmtSettings | null;
}

export interface MgmtSettings {
  network?: string;
  "ipv4-subnet"?: string;
  "ipv4-gw"?: string;
  "ipv4-range"?: string;
  "ipv6-subnet"?: string;
  "ipv6-gw"?: string;
  mtu?: number;
  bridge?: string;
  "external-access"?: boolean;
  "driver-opts"?: Record<string, string>;
}
