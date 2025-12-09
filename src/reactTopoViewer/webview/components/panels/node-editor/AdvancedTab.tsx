/**
 * Advanced Tab for Node Editor
 */
import React from 'react';
import { TabProps, HealthCheckConfig } from './types';
import { FormField, InputField, SelectField, CheckboxField, DynamicList, KeyValueList, Section } from '../../shared/form';

const KEY_SIZE_OPTIONS = [
  { value: '', label: 'Default' },
  { value: '2048', label: '2048' },
  { value: '4096', label: '4096' }
];

const PULL_POLICY_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
  { value: 'if-not-present', label: 'If Not Present' }
];

const RUNTIME_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'runc', label: 'runc' },
  { value: 'kata', label: 'kata' },
  { value: 'runsc', label: 'runsc (gVisor)' }
];

/**
 * Resource Limits Section
 */
const ResourceLimitsSection: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Resource Limits">
    <div className="grid grid-cols-2 gap-2">
      <FormField label="CPU Limit">
        <InputField
          id="node-cpu"
          type="number"
          value={String(data.cpu ?? '')}
          onChange={(v) => onChange({ cpu: v ? parseFloat(v) : undefined })}
          placeholder="e.g., 1.5"
          step={0.1}
          min={0}
        />
      </FormField>
      <FormField label="CPU Set">
        <InputField
          id="node-cpu-set"
          value={data.cpuSet || ''}
          onChange={(v) => onChange({ cpuSet: v })}
          placeholder="e.g., 0-3, 0,3"
        />
      </FormField>
      <FormField label="Memory Limit">
        <InputField
          id="node-memory"
          value={data.memory || ''}
          onChange={(v) => onChange({ memory: v })}
          placeholder="e.g., 1Gb, 512Mb"
        />
      </FormField>
      <FormField label="Shared Memory Size">
        <InputField
          id="node-shm-size"
          value={data.shmSize || ''}
          onChange={(v) => onChange({ shmSize: v })}
          placeholder="e.g., 256MB"
        />
      </FormField>
    </div>
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
    <CheckboxField
      id="node-cert-issue"
      label="Auto-generate TLS certificate"
      checked={data.certIssue || false}
      onChange={(checked) => onChange({ certIssue: checked })}
    />
    {data.certIssue && (
      <div className="mt-2 space-y-3">
        <FormField label="Key Size">
          <SelectField
            id="node-cert-key-size"
            value={data.certKeySize || ''}
            onChange={(v) => onChange({ certKeySize: v })}
            options={KEY_SIZE_OPTIONS}
          />
        </FormField>
        <FormField label="Validity Duration">
          <InputField
            id="node-cert-validity"
            value={data.certValidity || ''}
            onChange={(v) => onChange({ certValidity: v })}
            placeholder="e.g., 1h, 30d, 1y"
          />
        </FormField>
        <FormField label="SANs (Subject Alternative Names)">
          <DynamicList
            items={data.sans || []}
            onChange={(items) => onChange({ sans: items })}
            placeholder="SAN entry"
            addLabel="Add SAN"
          />
        </FormField>
      </div>
    )}
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
  <div className="grid grid-cols-2 gap-2 mt-2">
    <FormField label="Start Period (s)">
      <InputField
        id="node-healthcheck-start-period"
        type="number"
        value={String(hc.startPeriod ?? '')}
        onChange={(v) => updateHc({ startPeriod: v ? parseInt(v, 10) : undefined })}
        placeholder="0"
        min={0}
      />
    </FormField>
    <FormField label="Interval (s)">
      <InputField
        id="node-healthcheck-interval"
        type="number"
        value={String(hc.interval ?? '')}
        onChange={(v) => updateHc({ interval: v ? parseInt(v, 10) : undefined })}
        placeholder="30"
        min={0}
      />
    </FormField>
    <FormField label="Timeout (s)">
      <InputField
        id="node-healthcheck-timeout"
        type="number"
        value={String(hc.timeout ?? '')}
        onChange={(v) => updateHc({ timeout: v ? parseInt(v, 10) : undefined })}
        placeholder="30"
        min={0}
      />
    </FormField>
    <FormField label="Retries">
      <InputField
        id="node-healthcheck-retries"
        type="number"
        value={String(hc.retries ?? '')}
        onChange={(v) => updateHc({ retries: v ? parseInt(v, 10) : undefined })}
        placeholder="3"
        min={0}
      />
    </FormField>
  </div>
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
      <FormField label="Test Command">
        <InputField
          id="node-healthcheck-test"
          value={hc.test || ''}
          onChange={(v) => updateHc({ test: v })}
          placeholder="e.g., CMD-SHELL cat /etc/os-release"
        />
      </FormField>
      <HealthCheckTimings hc={hc} updateHc={updateHc} />
    </Section>
  );
};

export const AdvancedTab: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="space-y-3">
    <ResourceLimitsSection data={data} onChange={onChange} />
    <CapabilitiesSection data={data} onChange={onChange} />
    <SysctlsSection data={data} onChange={onChange} />
    <DevicesSection data={data} onChange={onChange} />
    <TlsCertSection data={data} onChange={onChange} />
    <HealthCheckSection data={data} onChange={onChange} />

    {/* Image Pull Policy */}
    <FormField label="Image Pull Policy">
      <SelectField
        id="node-image-pull-policy"
        value={data.imagePullPolicy || ''}
        onChange={(v) => onChange({ imagePullPolicy: v })}
        options={PULL_POLICY_OPTIONS}
      />
    </FormField>

    {/* Container Runtime */}
    <FormField label="Container Runtime">
      <SelectField
        id="node-runtime"
        value={data.runtime || ''}
        onChange={(v) => onChange({ runtime: v })}
        options={RUNTIME_OPTIONS}
      />
    </FormField>
  </div>
);
