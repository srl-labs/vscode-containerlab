// Advanced tab for node editor.
import React from "react";
import Box from "@mui/material/Box";

import {
  InputField,
  SelectField,
  CheckboxField,
  DynamicList,
  KeyValueList,
  PanelAddSection,
  PanelSection
} from "../../ui/form";

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

const ResourceLimitsSection: React.FC<TabProps> = ({ data, onChange }) => (
  <PanelSection title="Resource Limits" withTopDivider={false} bodySx={{ p: 2 }}>
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
        value={data.cpuSet ?? ""}
        onChange={(v) => onChange({ cpuSet: v })}
        placeholder="e.g., 0-3, 0,3"
      />
      <InputField
        id="node-memory"
        label="Memory Limit"
        value={data.memory ?? ""}
        onChange={(v) => onChange({ memory: v })}
        placeholder="e.g., 1Gb, 512Mb"
      />
      <InputField
        id="node-shm-size"
        label="Shared Memory Size"
        value={data.shmSize ?? ""}
        onChange={(v) => onChange({ shmSize: v })}
        placeholder="e.g., 256MB"
      />
    </Box>
  </PanelSection>
);

interface TlsCertificateSectionProps extends TabProps {
  certIssue: boolean;
}

const TlsCertificateSection: React.FC<TlsCertificateSectionProps> = ({ data, onChange, certIssue }) => (
  <PanelSection title="TLS Certificate">
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <CheckboxField
        id="node-cert-issue"
        label="Auto-generate TLS certificate"
        checked={certIssue}
        onChange={(checked) => onChange({ certIssue: checked })}
      />
      {certIssue && (
        <>
          <SelectField
            id="node-cert-key-size"
            label="Key Size"
            value={data.certKeySize ?? ""}
            onChange={(v) => onChange({ certKeySize: v })}
            options={KEY_SIZE_OPTIONS}
          />
          <InputField
            id="node-cert-validity"
            label="Validity Duration"
            value={data.certValidity ?? ""}
            onChange={(v) => onChange({ certValidity: v })}
            placeholder="e.g., 1h, 30d, 1y"
          />
        </>
      )}
    </Box>
  </PanelSection>
);

interface SansSectionProps extends TabProps {
  certIssue: boolean;
  sans: string[];
  onAddSan: () => void;
}

const SansSection: React.FC<SansSectionProps> = ({ certIssue, sans, onChange, onAddSan }) => {
  if (!certIssue) return null;

  return (
    <PanelAddSection title="SANs (Subject Alternative Names)" onAdd={onAddSan}>
      <DynamicList
        items={sans}
        onChange={(items) => onChange({ sans: items })}
        placeholder="SAN entry"
        hideAddButton
      />
    </PanelAddSection>
  );
};

interface HealthCheckSectionProps {
  healthCheck: Partial<HealthCheckConfig>;
  onUpdate: (updates: Partial<HealthCheckConfig>) => void;
}

const HealthCheckSection: React.FC<HealthCheckSectionProps> = ({ healthCheck, onUpdate }) => (
  <PanelSection title="Health Check" bodySx={{ p: 2 }}>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <InputField
        id="node-healthcheck-test"
        label="Test Command"
        value={healthCheck.test ?? ""}
        onChange={(v) => onUpdate({ test: v })}
        placeholder="e.g., CMD-SHELL cat /etc/os-release"
      />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <InputField
          id="node-healthcheck-start-period"
          label="Start Period (s)"
          type="number"
          value={String(healthCheck.startPeriod ?? "")}
          onChange={(v) => onUpdate({ startPeriod: v ? parseInt(v, 10) : undefined })}
          placeholder="0"
          min={0}
        />
        <InputField
          id="node-healthcheck-interval"
          label="Interval (s)"
          type="number"
          value={String(healthCheck.interval ?? "")}
          onChange={(v) => onUpdate({ interval: v ? parseInt(v, 10) : undefined })}
          placeholder="30"
          min={0}
        />
        <InputField
          id="node-healthcheck-timeout"
          label="Timeout (s)"
          type="number"
          value={String(healthCheck.timeout ?? "")}
          onChange={(v) => onUpdate({ timeout: v ? parseInt(v, 10) : undefined })}
          placeholder="30"
          min={0}
        />
        <InputField
          id="node-healthcheck-retries"
          label="Retries"
          type="number"
          value={String(healthCheck.retries ?? "")}
          onChange={(v) => onUpdate({ retries: v ? parseInt(v, 10) : undefined })}
          placeholder="3"
          min={0}
        />
      </Box>
    </Box>
  </PanelSection>
);

const RuntimeSection: React.FC<TabProps> = ({ data, onChange }) => (
  <PanelSection title="Container Runtime">
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <SelectField
        id="node-image-pull-policy"
        label="Image Pull Policy"
        value={data.imagePullPolicy ?? ""}
        onChange={(v) => onChange({ imagePullPolicy: v })}
        options={PULL_POLICY_OPTIONS}
      />
      <SelectField
        id="node-runtime"
        label="Container Runtime"
        value={data.runtime ?? ""}
        onChange={(v) => onChange({ runtime: v })}
        options={RUNTIME_OPTIONS}
      />
    </Box>
  </PanelSection>
);

export const AdvancedTab: React.FC<TabProps> = ({ data, onChange }) => {
  const healthCheck = data.healthCheck ?? {};
  const capAdd = data.capAdd ?? [];
  const sysctls = data.sysctls ?? {};
  const devices = data.devices ?? [];
  const sans = data.sans ?? [];
  const certIssue = Boolean(data.certIssue);

  const updateHealthCheck = (updates: Partial<HealthCheckConfig>) => {
    onChange({ healthCheck: { ...healthCheck, ...updates } });
  };

  const handleAddCapability = () => {
    onChange({ capAdd: [...capAdd, ""] });
  };

  const handleAddSysctl = () => {
    onChange({ sysctls: { ...sysctls, "": "" } });
  };

  const handleAddDevice = () => {
    onChange({ devices: [...devices, ""] });
  };

  const handleAddSan = () => {
    onChange({ sans: [...sans, ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <ResourceLimitsSection data={data} onChange={onChange} />
      <PanelAddSection title="Capabilities" onAdd={handleAddCapability}>
        <DynamicList
          items={capAdd}
          onChange={(items) => onChange({ capAdd: items })}
          placeholder="e.g., NET_ADMIN"
          hideAddButton
        />
      </PanelAddSection>
      <PanelAddSection title="Sysctls" onAdd={handleAddSysctl}>
        <KeyValueList
          items={sysctls}
          onChange={(items) => onChange({ sysctls: items })}
          keyPlaceholder="Sysctl key"
          valuePlaceholder="Value"
          hideAddButton
        />
      </PanelAddSection>
      <PanelAddSection title="Devices" onAdd={handleAddDevice}>
        <DynamicList
          items={devices}
          onChange={(items) => onChange({ devices: items })}
          placeholder="host:container[:permissions]"
          hideAddButton
        />
      </PanelAddSection>
      <TlsCertificateSection data={data} onChange={onChange} certIssue={certIssue} />
      <SansSection
        data={data}
        onChange={onChange}
        certIssue={certIssue}
        sans={sans}
        onAddSan={handleAddSan}
      />
      <HealthCheckSection healthCheck={healthCheck} onUpdate={updateHealthCheck} />
      <RuntimeSection data={data} onChange={onChange} />
    </Box>
  );
};
