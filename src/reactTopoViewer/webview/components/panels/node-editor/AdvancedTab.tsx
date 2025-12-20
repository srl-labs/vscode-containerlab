/**
 * Advanced Tab for Node Editor
 */
import React from 'react';

import { FormField, InputField, SelectField, CheckboxField, DynamicList, KeyValueList, Section } from '../../shared/form';

import type { TabProps, HealthCheckConfig } from './types';

/** Helper to check if a property is inherited */
const isInherited = (prop: string, inheritedProps: string[] = []) => inheritedProps.includes(prop);

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
const ResourceLimitsSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <Section title="Resource Limits">
    <div className="grid grid-cols-2 gap-2">
      <FormField label="CPU Limit" inherited={isInherited('cpu', inheritedProps)}>
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
      <FormField label="CPU Set" inherited={isInherited('cpu-set', inheritedProps)}>
        <InputField
          id="node-cpu-set"
          value={data.cpuSet || ''}
          onChange={(v) => onChange({ cpuSet: v })}
          placeholder="e.g., 0-3, 0,3"
        />
      </FormField>
      <FormField label="Memory Limit" inherited={isInherited('memory', inheritedProps)}>
        <InputField
          id="node-memory"
          value={data.memory || ''}
          onChange={(v) => onChange({ memory: v })}
          placeholder="e.g., 1Gb, 512Mb"
        />
      </FormField>
      <FormField label="Shared Memory Size" inherited={isInherited('shm-size', inheritedProps)}>
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
const CapabilitiesSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <Section title="Capabilities" inherited={isInherited('cap-add', inheritedProps)}>
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
const SysctlsSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <Section title="Sysctls" inherited={isInherited('sysctls', inheritedProps)}>
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
const DevicesSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <Section title="Devices" inherited={isInherited('devices', inheritedProps)}>
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
const TlsCertSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <Section title="TLS Certificate" inherited={isInherited('certificate', inheritedProps)}>
    <CheckboxField
      id="node-cert-issue"
      label="Auto-generate TLS certificate"
      checked={data.certIssue || false}
      onChange={(checked) => onChange({ certIssue: checked })}
    />
    {data.certIssue && (
      <div className="mt-2 space-y-3">
        <FormField label="Key Size" inherited={isInherited('certificate', inheritedProps)}>
          <SelectField
            id="node-cert-key-size"
            value={data.certKeySize || ''}
            onChange={(v) => onChange({ certKeySize: v })}
            options={KEY_SIZE_OPTIONS}
          />
        </FormField>
        <FormField label="Validity Duration" inherited={isInherited('certificate', inheritedProps)}>
          <InputField
            id="node-cert-validity"
            value={data.certValidity || ''}
            onChange={(v) => onChange({ certValidity: v })}
            placeholder="e.g., 1h, 30d, 1y"
          />
        </FormField>
        <FormField label="SANs (Subject Alternative Names)" inherited={isInherited('sans', inheritedProps)}>
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
const HealthCheckSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => {
  const hc = data.healthCheck || {};
  const updateHc = (updates: Partial<HealthCheckConfig>) => {
    onChange({ healthCheck: { ...hc, ...updates } });
  };

  return (
    <Section title="Health Check" inherited={isInherited('healthcheck', inheritedProps)}>
      <FormField label="Test Command" inherited={isInherited('healthcheck', inheritedProps)}>
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

export const AdvancedTab: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <div className="space-y-3">
    <ResourceLimitsSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <CapabilitiesSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <SysctlsSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <DevicesSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <TlsCertSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <HealthCheckSection data={data} onChange={onChange} inheritedProps={inheritedProps} />

    {/* Image Pull Policy */}
    <FormField label="Image Pull Policy" inherited={isInherited('image-pull-policy', inheritedProps)}>
      <SelectField
        id="node-image-pull-policy"
        value={data.imagePullPolicy || ''}
        onChange={(v) => onChange({ imagePullPolicy: v })}
        options={PULL_POLICY_OPTIONS}
      />
    </FormField>

    {/* Container Runtime */}
    <FormField label="Container Runtime" inherited={isInherited('runtime', inheritedProps)}>
      <SelectField
        id="node-runtime"
        value={data.runtime || ''}
        onChange={(v) => onChange({ runtime: v })}
        options={RUNTIME_OPTIONS}
      />
    </FormField>
  </div>
);
