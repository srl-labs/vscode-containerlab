/**
 * Advanced Tab for Node Editor
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { InputField, SelectField, CheckboxField, DynamicList, KeyValueList, Section } from "../../ui/form";

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

/**
 * Resource Limits Section
 */
const ResourceLimitsSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Resource Limits">
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
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
  </Section>
);

/**
 * Capabilities Section
 */
const CapabilitiesSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Capabilities">
    <DynamicList
      items={data.capAdd || []}
      onChange={(items) => onChange({ capAdd: items })}
      placeholder="e.g., NET_ADMIN"
      addLabel="Add Capability"
    />
  </Section>
);

/**
 * Sysctls Section
 */
const SysctlsSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Sysctls">
    <KeyValueList
      items={data.sysctls || {}}
      onChange={(items) => onChange({ sysctls: items })}
      keyPlaceholder="Sysctl key"
      valuePlaceholder="Value"
      addLabel="Add Sysctl"
    />
  </Section>
);

/**
 * Devices Section
 */
const DevicesSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Devices">
    <DynamicList
      items={data.devices || []}
      onChange={(items) => onChange({ devices: items })}
      placeholder="host:container[:permissions]"
      addLabel="Add Device"
    />
  </Section>
);

/**
 * TLS Certificate Section
 */
const TlsCertSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="TLS Certificate">
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
          <Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
            >
              SANs (Subject Alternative Names)
            </Typography>
            <DynamicList
              items={data.sans || []}
              onChange={(items) => onChange({ sans: items })}
              placeholder="SAN entry"
              addLabel="Add SAN"
            />
          </Box>
        </>
      )}
    </Box>
  </Section>
);

/**
 * Health Check Timings Grid
 */
interface HealthCheckTimingsProps {
  hc: HealthCheckConfig;
  updateHc: (updates: Partial<HealthCheckConfig>) => void;
}

const HealthCheckTimings: React.FC<HealthCheckTimingsProps> = ({ hc, updateHc }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 2 }}>
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
);

/**
 * Health Check Section
 */
const HealthCheckSection: React.FC<TabProps> = ({ data, onChange }) => {
  const hc = data.healthCheck || {};
  const updateHc = (updates: Partial<HealthCheckConfig>) => {
    onChange({ healthCheck: { ...hc, ...updates } });
  };

  return (
    <Section title="Health Check">
      <InputField
        id="node-healthcheck-test"
        label="Test Command"
        value={hc.test || ""}
        onChange={(v) => updateHc({ test: v })}
        placeholder="e.g., CMD-SHELL cat /etc/os-release"
      />
      <HealthCheckTimings hc={hc} updateHc={updateHc} />
    </Section>
  );
};

export const AdvancedTab: React.FC<TabProps> = ({ data, onChange }) => {
  const sections = [
    ResourceLimitsSection,
    CapabilitiesSection,
    SysctlsSection,
    DevicesSection,
    TlsCertSection,
    HealthCheckSection
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sections.map((SectionComponent, index) => (
        <SectionComponent key={index} data={data} onChange={onChange} />
      ))}

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
  );
};
