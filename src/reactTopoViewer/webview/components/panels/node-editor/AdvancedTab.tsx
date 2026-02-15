// Advanced tab for node editor.
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { InputField, SelectField, CheckboxField, DynamicList, KeyValueList } from "../../ui/form";

import type { TabProps, HealthCheckConfig } from "./types";

const KEY_SIZE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "2048", label: "2048" },
  { value: "4096", label: "4096" }
];

const PULL_POLICY_OPTIONS = [
  { value: "", label: "Default" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
  { value: "if-not-present", label: "If Not Present" }
];

const RUNTIME_OPTIONS = [
  { value: "", label: "Default" },
  { value: "runc", label: "runc" },
  { value: "kata", label: "kata" },
  { value: "runsc", label: "runsc (gVisor)" }
];

export const AdvancedTab: React.FC<TabProps> = ({ data, onChange }) => {
  const hc = data.healthCheck || {};

  const updateHc = (updates: Partial<HealthCheckConfig>) => {
    onChange({ healthCheck: { ...hc, ...updates } });
  };

  const handleAddCapability = () => {
    onChange({ capAdd: [...(data.capAdd || []), ""] });
  };

  const handleAddSysctl = () => {
    onChange({ sysctls: { ...(data.sysctls || {}), "": "" } });
  };

  const handleAddDevice = () => {
    onChange({ devices: [...(data.devices || []), ""] });
  };

  const handleAddSan = () => {
    onChange({ sans: [...(data.sans || []), ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Resource Limits */}
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Resource Limits</Typography>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <InputField
            id="node-cpu"
            label="CPU Limit"
            type="number"
            value={String(data.cpu ?? "")}
            onChange={(v) => onChange({ cpu: v ? parseFloat(v) : undefined })}
            placeholder="e.g., 1.5"
            step={0.1}
            min={0}
          />
          <InputField
            id="node-cpu-set"
            label="CPU Set"
            value={data.cpuSet || ""}
            onChange={(v) => onChange({ cpuSet: v })}
            placeholder="e.g., 0-3, 0,3"
          />
          <InputField
            id="node-memory"
            label="Memory Limit"
            value={data.memory || ""}
            onChange={(v) => onChange({ memory: v })}
            placeholder="e.g., 1Gb, 512Mb"
          />
          <InputField
            id="node-shm-size"
            label="Shared Memory Size"
            value={data.shmSize || ""}
            onChange={(v) => onChange({ shmSize: v })}
            placeholder="e.g., 256MB"
          />
        </Box>
      </Box>

      {/* Capabilities */}
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
        <Typography variant="subtitle2">Capabilities</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddCapability} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.capAdd || []}
          onChange={(items) => onChange({ capAdd: items })}
          placeholder="e.g., NET_ADMIN"
          hideAddButton
        />
      </Box>

      {/* Sysctls */}
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
        <Typography variant="subtitle2">Sysctls</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddSysctl} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <KeyValueList
          items={data.sysctls || {}}
          onChange={(items) => onChange({ sysctls: items })}
          keyPlaceholder="Sysctl key"
          valuePlaceholder="Value"
          hideAddButton
        />
      </Box>

      {/* Devices */}
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
        <Typography variant="subtitle2">Devices</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddDevice} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.devices || []}
          onChange={(items) => onChange({ devices: items })}
          placeholder="host:container[:permissions]"
          hideAddButton
        />
      </Box>

      {/* TLS Certificate */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">TLS Certificate</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <CheckboxField
          id="node-cert-issue"
          label="Auto-generate TLS certificate"
          checked={data.certIssue || false}
          onChange={(checked) => onChange({ certIssue: checked })}
        />
        {data.certIssue && (
          <>
            <SelectField
              id="node-cert-key-size"
              label="Key Size"
              value={data.certKeySize || ""}
              onChange={(v) => onChange({ certKeySize: v })}
              options={KEY_SIZE_OPTIONS}
            />
            <InputField
              id="node-cert-validity"
              label="Validity Duration"
              value={data.certValidity || ""}
              onChange={(v) => onChange({ certValidity: v })}
              placeholder="e.g., 1h, 30d, 1y"
            />
          </>
        )}
      </Box>

      {/* SANs - only show when cert issue is enabled */}
      {data.certIssue && (
        <>
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
            <Typography variant="subtitle2">SANs (Subject Alternative Names)</Typography>
            <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddSan} sx={{ py: 0 }}>
              ADD
            </Button>
          </Box>
          <Divider />
          <Box sx={{ p: 2 }}>
            <DynamicList
              items={data.sans || []}
              onChange={(items) => onChange({ sans: items })}
              placeholder="SAN entry"
              hideAddButton
            />
          </Box>
        </>
      )}

      {/* Health Check */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Health Check</Typography>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <InputField
            id="node-healthcheck-test"
            label="Test Command"
            value={hc.test || ""}
            onChange={(v) => updateHc({ test: v })}
            placeholder="e.g., CMD-SHELL cat /etc/os-release"
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <InputField
              id="node-healthcheck-start-period"
              label="Start Period (s)"
              type="number"
              value={String(hc.startPeriod ?? "")}
              onChange={(v) => updateHc({ startPeriod: v ? parseInt(v, 10) : undefined })}
              placeholder="0"
              min={0}
            />
            <InputField
              id="node-healthcheck-interval"
              label="Interval (s)"
              type="number"
              value={String(hc.interval ?? "")}
              onChange={(v) => updateHc({ interval: v ? parseInt(v, 10) : undefined })}
              placeholder="30"
              min={0}
            />
            <InputField
              id="node-healthcheck-timeout"
              label="Timeout (s)"
              type="number"
              value={String(hc.timeout ?? "")}
              onChange={(v) => updateHc({ timeout: v ? parseInt(v, 10) : undefined })}
              placeholder="30"
              min={0}
            />
            <InputField
              id="node-healthcheck-retries"
              label="Retries"
              type="number"
              value={String(hc.retries ?? "")}
              onChange={(v) => updateHc({ retries: v ? parseInt(v, 10) : undefined })}
              placeholder="3"
              min={0}
            />
          </Box>
        </Box>
      </Box>

      {/* Container Runtime */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Container Runtime</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <SelectField
          id="node-image-pull-policy"
          label="Image Pull Policy"
          value={data.imagePullPolicy || ""}
          onChange={(v) => onChange({ imagePullPolicy: v })}
          options={PULL_POLICY_OPTIONS}
        />
        <SelectField
          id="node-runtime"
          label="Container Runtime"
          value={data.runtime || ""}
          onChange={(v) => onChange({ runtime: v })}
          options={RUNTIME_OPTIONS}
        />
      </Box>
    </Box>
  );
};
