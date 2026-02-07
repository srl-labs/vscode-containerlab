/**
 * MgmtTab - Management network settings tab for Lab Settings panel
 */
import React from "react";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography
} from "@mui/material";

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
  onRemoveDriverOption: (index: number) => void;
  onUpdateDriverOption: (index: number, field: "key" | "value", value: string) => void;
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
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

/** Driver options section */
const DriverOptionsSection: React.FC<
  Pick<
    MgmtTabProps,
    | "driverOptions"
    | "isViewMode"
    | "onAddDriverOption"
    | "onRemoveDriverOption"
    | "onUpdateDriverOption"
  >
> = (props) => (
  <Box>
    <Typography variant="body2" sx={{ mb: 1 }}>
      Bridge Driver Options
    </Typography>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {props.driverOptions.map((opt, idx) => (
        <Box key={idx} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            placeholder="Option key"
            value={opt.key}
            onChange={(e) => props.onUpdateDriverOption(idx, "key", e.target.value)}
            disabled={props.isViewMode}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            placeholder="Option value"
            value={opt.value}
            onChange={(e) => props.onUpdateDriverOption(idx, "value", e.target.value)}
            disabled={props.isViewMode}
            size="small"
            sx={{ flex: 1 }}
          />
          {!props.isViewMode && (
            <IconButton
              size="small"
              onClick={() => props.onRemoveDriverOption(idx)}
              title="Remove option"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
    {!props.isViewMode && (
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={props.onAddDriverOption}
        sx={{ mt: 1 }}
      >
        Add Option
      </Button>
    )}
  </Box>
);

export const MgmtTab: React.FC<MgmtTabProps> = (props) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Network Name */}
      <TextField
        label="Network Name"
        placeholder="clab"
        value={props.networkName}
        onChange={(e) => props.onNetworkNameChange(e.target.value)}
        disabled={props.isViewMode}
        size="small"
        fullWidth
        helperText="Docker network name (default: clab)"
      />

      <Ipv4Section {...props} />
      <Ipv6Section {...props} />

      {/* MTU */}
      <TextField
        label="MTU"
        type="number"
        placeholder="Default: auto"
        value={props.mtu}
        onChange={(e) => props.onMtuChange(e.target.value)}
        disabled={props.isViewMode}
        size="small"
        fullWidth
        helperText="MTU size (defaults to docker0 interface MTU)"
        slotProps={{ htmlInput: { min: 0, step: 1 } }}
      />

      {/* Bridge Name */}
      <TextField
        label="Bridge Name"
        placeholder="Default: auto"
        value={props.bridge}
        onChange={(e) => props.onBridgeChange(e.target.value)}
        disabled={props.isViewMode}
        size="small"
        fullWidth
        helperText="Custom Linux bridge name (default: br-<network-id>)"
      />

      {/* External Access */}
      <Box>
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
        <FormHelperText sx={{ mt: -0.5, ml: 4 }}>
          Allow external systems to reach lab nodes
        </FormHelperText>
      </Box>

      <DriverOptionsSection {...props} />
    </Box>
  );
};
