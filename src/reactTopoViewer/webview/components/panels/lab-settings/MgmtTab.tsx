// Management network settings tab.
import React from "react";
import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { KeyValueList } from "../../ui/form";

import type { IpType, DriverOption } from "./types";

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
  onSetDriverOptions: (options: DriverOption[]) => void;
}

/** IPv4 settings section */
const Ipv4Section: React.FC<
  Pick<
    MgmtTabProps,
    | "ipv4Type"
    | "ipv4Subnet"
    | "ipv4Gateway"
    | "ipv4Range"
    | "isViewMode"
    | "onIpv4TypeChange"
    | "onIpv4SubnetChange"
    | "onIpv4GatewayChange"
    | "onIpv4RangeChange"
  >
> = (props) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <FormControl size="small" fullWidth disabled={props.isViewMode}>
      <InputLabel>IPv4 Subnet</InputLabel>
      <Select
        value={props.ipv4Type}
        label="IPv4 Subnet"
        onChange={(e) => props.onIpv4TypeChange(e.target.value as IpType)}
      >
        <MenuItem value="default">Default (172.20.20.0/24)</MenuItem>
        <MenuItem value="auto">Auto-assign</MenuItem>
        <MenuItem value="custom">Custom</MenuItem>
      </Select>
    </FormControl>

    {props.ipv4Type === "custom" && (
      <>
        <TextField
          label="IPv4 Subnet"
          placeholder="e.g., 172.100.100.0/24"
          value={props.ipv4Subnet}
          onChange={(e) => props.onIpv4SubnetChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />
        <TextField
          label="IPv4 Gateway"
          placeholder="e.g., 172.100.100.1"
          value={props.ipv4Gateway}
          onChange={(e) => props.onIpv4GatewayChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />
        <TextField
          label="IPv4 Range"
          placeholder="e.g., 172.100.100.128/25"
          value={props.ipv4Range}
          onChange={(e) => props.onIpv4RangeChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />
      </>
    )}
  </Box>
);

/** IPv6 settings section */
const Ipv6Section: React.FC<
  Pick<
    MgmtTabProps,
    | "ipv6Type"
    | "ipv6Subnet"
    | "ipv6Gateway"
    | "isViewMode"
    | "onIpv6TypeChange"
    | "onIpv6SubnetChange"
    | "onIpv6GatewayChange"
  >
> = (props) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <FormControl size="small" fullWidth disabled={props.isViewMode}>
      <InputLabel>IPv6 Subnet</InputLabel>
      <Select
        value={props.ipv6Type}
        label="IPv6 Subnet"
        onChange={(e) => props.onIpv6TypeChange(e.target.value as IpType)}
      >
        <MenuItem value="default">Default (3fff:172:20:20::/64)</MenuItem>
        <MenuItem value="auto">Auto-assign</MenuItem>
        <MenuItem value="custom">Custom</MenuItem>
      </Select>
    </FormControl>

    {props.ipv6Type === "custom" && (
      <>
        <TextField
          label="IPv6 Subnet"
          placeholder="e.g., 3fff:172:100:100::/80"
          value={props.ipv6Subnet}
          onChange={(e) => props.onIpv6SubnetChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />
        <TextField
          label="IPv6 Gateway"
          placeholder="e.g., 3fff:172:100:100::1"
          value={props.ipv6Gateway}
          onChange={(e) => props.onIpv6GatewayChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />
      </>
    )}
  </Box>
);

/** Convert DriverOption[] to Record for KeyValueList */
function driverOptionsToRecord(options: DriverOption[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const opt of options) {
    record[opt.key] = opt.value;
  }
  return record;
}

/** Convert Record back to DriverOption[] */
function recordToDriverOptions(record: Record<string, string>): DriverOption[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

export const MgmtTab: React.FC<MgmtTabProps> = (props) => {
  const driverRecord = driverOptionsToRecord(props.driverOptions);

  const handleDriverChange = (record: Record<string, string>) => {
    props.onSetDriverOptions(recordToDriverOptions(record));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        {/* Network Name */}
        <TextField
          label="Network Name"
          placeholder="Docker network name (default: clab)"
          value={props.networkName}
          onChange={(e) => props.onNetworkNameChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />

        <Ipv4Section {...props} />
        <Ipv6Section {...props} />

        {/* MTU */}
        <TextField
          label="MTU"
          type="number"
          placeholder="Defaults to docker0 interface MTU"
          value={props.mtu}
          onChange={(e) => props.onMtuChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
        />

        {/* Bridge Name */}
        <TextField
          label="Bridge Name"
          placeholder="Linux bridge name (default: br-<network-id>)"
          value={props.bridge}
          onChange={(e) => props.onBridgeChange(e.target.value)}
          disabled={props.isViewMode}
          size="small"
          fullWidth
        />

        {/* External Access */}
        <FormControlLabel
          control={
            <Checkbox
              checked={props.externalAccess}
              onChange={(e) => props.onExternalAccessChange(e.target.checked)}
              disabled={props.isViewMode}
              size="small"
            />
          }
          label="Enable External Access"
        />
      </Box>

      {/* Bridge Driver Options */}
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
        <Typography variant="subtitle2">Bridge Driver Options</Typography>
        {!props.isViewMode && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={props.onAddDriverOption}
            sx={{ py: 0 }}
          >
            ADD
          </Button>
        )}
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <KeyValueList
          items={driverRecord}
          onChange={handleDriverChange}
          keyPlaceholder="Option key"
          valuePlaceholder="Option value"
          disabled={props.isViewMode}
          hideAddButton
        />
      </Box>
    </Box>
  );
};
