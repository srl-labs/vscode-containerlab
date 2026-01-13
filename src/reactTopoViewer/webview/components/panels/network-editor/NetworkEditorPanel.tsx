/**
 * Network Editor Panel
 * Editor for network node configuration (host, mgmt-net, vxlan, bridge, etc.)
 */
import React, { useState, useEffect, useCallback } from 'react';

import { EditorPanel } from '../../shared/editor';
import { FormField, InputField, FilterableDropdown, Section, KeyValueList } from '../../shared/form';

import type {
  NetworkEditorData,
  NetworkType} from './types';
import {
  NETWORK_TYPES,
  VXLAN_TYPES,
  BRIDGE_TYPES,
  MACVLAN_MODES,
  getInterfaceLabel,
  getInterfacePlaceholder,
  showInterfaceField,
  supportsExtendedProps
} from './types';

interface NetworkEditorPanelProps {
  isVisible: boolean;
  nodeData: NetworkEditorData | null;
  onClose: () => void;
  onSave: (data: NetworkEditorData) => void;
  onApply: (data: NetworkEditorData) => void;
}

/** Network type dropdown options */
const NETWORK_TYPE_OPTIONS = NETWORK_TYPES.map(type => ({
  value: type,
  label: type
}));

/** MACVLAN mode dropdown options */
const MACVLAN_MODE_OPTIONS = MACVLAN_MODES.map(mode => ({
  value: mode,
  label: mode
}));

/**
 * Hook to manage network editor form state with change tracking
 */
function useNetworkEditorForm(nodeData: NetworkEditorData | null) {
  const [formData, setFormData] = useState<NetworkEditorData | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (nodeData) {
      setFormData({ ...nodeData });
      setInitialData(JSON.stringify(nodeData));
    }
  }, [nodeData]);

  const handleChange = useCallback((updates: Partial<NetworkEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const resetInitialData = useCallback(() => {
    if (formData) {
      setInitialData(JSON.stringify(formData));
    }
  }, [formData]);

  const hasChanges = formData && initialData
    ? JSON.stringify(formData) !== initialData
    : false;

  return { formData, handleChange, hasChanges, resetInitialData };
}

/**
 * Network Type field with dropdown
 */
const NetworkTypeField: React.FC<{
  value: NetworkType;
  onChange: (value: NetworkType) => void;
}> = ({ value, onChange }) => (
  <FormField label="Network Type">
    <FilterableDropdown
      id="network-type"
      options={NETWORK_TYPE_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as NetworkType)}
      placeholder="Select network type..."
      allowFreeText={false}
    />
  </FormField>
);

/**
 * Interface/Bridge Name field (shown for most types)
 */
const InterfaceField: React.FC<{
  networkType: NetworkType;
  value: string;
  onChange: (value: string) => void;
}> = ({ networkType, value, onChange }) => {
  if (!showInterfaceField(networkType)) {
    return null;
  }

  return (
    <FormField label={getInterfaceLabel(networkType)}>
      <InputField
        id="network-interface"
        value={value}
        onChange={onChange}
        placeholder={getInterfacePlaceholder(networkType)}
      />
    </FormField>
  );
};

/**
 * Label/Alias field (shown for bridges and vxlan types)
 */
const LabelField: React.FC<{
  networkType: NetworkType;
  value: string;
  onChange: (value: string) => void;
}> = ({ networkType, value, onChange }) => {
  const showLabel = BRIDGE_TYPES.includes(networkType) || VXLAN_TYPES.includes(networkType);

  if (!showLabel) {
    return null;
  }

  return (
    <FormField label="Label / Alias">
      <InputField
        id="network-label"
        value={value}
        onChange={onChange}
        placeholder="Display label for the network node"
      />
    </FormField>
  );
};

/**
 * VXLAN-specific fields section
 */
const VxlanFields: React.FC<{
  networkType: NetworkType;
  data: NetworkEditorData;
  onChange: (updates: Partial<NetworkEditorData>) => void;
}> = ({ networkType, data, onChange }) => {
  if (!VXLAN_TYPES.includes(networkType)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[var(--vscode-foreground)] opacity-70 mt-4 mb-2">
        VXLAN Settings
      </div>
      <FormField label="Remote">
        <InputField
          id="vxlan-remote"
          value={data.vxlanRemote || ''}
          onChange={(v) => onChange({ vxlanRemote: v })}
          placeholder="Remote endpoint IP address"
        />
      </FormField>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="VNI">
          <InputField
            id="vxlan-vni"
            value={data.vxlanVni || ''}
            onChange={(v) => onChange({ vxlanVni: v })}
            placeholder="e.g., 100"
          />
        </FormField>
        <FormField label="Dst Port">
          <InputField
            id="vxlan-dst-port"
            value={data.vxlanDstPort || ''}
            onChange={(v) => onChange({ vxlanDstPort: v })}
            placeholder="e.g., 4789"
          />
        </FormField>
        <FormField label="Src Port">
          <InputField
            id="vxlan-src-port"
            value={data.vxlanSrcPort || ''}
            onChange={(v) => onChange({ vxlanSrcPort: v })}
            placeholder="e.g., 0"
          />
        </FormField>
      </div>
    </div>
  );
};

/**
 * MACVLAN-specific mode field
 */
const MacvlanModeField: React.FC<{
  networkType: NetworkType;
  value: string | undefined;
  onChange: (value: string) => void;
}> = ({ networkType, value, onChange }) => {
  if (networkType !== 'macvlan') {
    return null;
  }

  return (
    <FormField label="Mode">
      <FilterableDropdown
        id="macvlan-mode"
        options={MACVLAN_MODE_OPTIONS}
        value={value || 'bridge'}
        onChange={onChange}
        placeholder="Select mode..."
        allowFreeText={false}
      />
    </FormField>
  );
};

/**
 * MAC Address field (optional, for all types)
 */
const MacAddressField: React.FC<{
  value: string | undefined;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <FormField label="MAC Address">
    <InputField
      id="network-mac"
      value={value || ''}
      onChange={onChange}
      placeholder="e.g., 00:11:22:33:44:55 (optional)"
    />
  </FormField>
);

/**
 * Extended Properties section (MTU, Vars, Labels)
 * Only shown for link types that support these fields
 */
const ExtendedPropertiesSection: React.FC<{
  networkType: NetworkType;
  data: NetworkEditorData;
  onChange: (updates: Partial<NetworkEditorData>) => void;
}> = ({ networkType, data, onChange }) => {
  if (!supportsExtendedProps(networkType)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-[var(--vscode-foreground)] opacity-70 mt-4 mb-2">
        Extended Properties
      </div>
      <FormField label="MTU">
        <InputField
          id="network-mtu"
          type="number"
          value={data.mtu || ''}
          onChange={(v) => onChange({ mtu: v })}
          placeholder="e.g., 9000"
          min={1}
          max={65535}
        />
      </FormField>
      <Section title="Vars">
        <KeyValueList
          items={data.vars || {}}
          onChange={(items) => onChange({ vars: items })}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          addLabel="Add Variable"
        />
      </Section>
      <Section title="Labels">
        <KeyValueList
          items={data.labels || {}}
          onChange={(items) => onChange({ labels: items })}
          keyPlaceholder="Label name"
          valuePlaceholder="Value"
          addLabel="Add Label"
        />
      </Section>
    </div>
  );
};

/**
 * Network Editor Panel content
 */
const NetworkEditorContent: React.FC<{
  formData: NetworkEditorData;
  onChange: (updates: Partial<NetworkEditorData>) => void;
}> = ({ formData, onChange }) => {
  // Handle network type change - may need to clear type-specific fields
  const handleNetworkTypeChange = useCallback((newType: NetworkType) => {
    const updates: Partial<NetworkEditorData> = { networkType: newType };

    // Clear VXLAN fields if switching away from VXLAN types
    if (!VXLAN_TYPES.includes(newType)) {
      updates.vxlanRemote = undefined;
      updates.vxlanVni = undefined;
      updates.vxlanDstPort = undefined;
      updates.vxlanSrcPort = undefined;
    }

    // Clear MACVLAN mode if switching away from macvlan
    if (newType !== 'macvlan') {
      updates.macvlanMode = undefined;
    }

    onChange(updates);
  }, [onChange]);

  return (
    <div className="space-y-3">
      <NetworkTypeField
        value={formData.networkType}
        onChange={handleNetworkTypeChange}
      />

      <InterfaceField
        networkType={formData.networkType}
        value={formData.interfaceName}
        onChange={(v) => onChange({ interfaceName: v })}
      />

      <LabelField
        networkType={formData.networkType}
        value={formData.label}
        onChange={(v) => onChange({ label: v })}
      />

      <MacvlanModeField
        networkType={formData.networkType}
        value={formData.macvlanMode}
        onChange={(v) => onChange({ macvlanMode: v })}
      />

      <VxlanFields
        networkType={formData.networkType}
        data={formData}
        onChange={onChange}
      />

      <MacAddressField
        value={formData.mac}
        onChange={(v) => onChange({ mac: v })}
      />

      <ExtendedPropertiesSection
        networkType={formData.networkType}
        data={formData}
        onChange={onChange}
      />
    </div>
  );
};

export const NetworkEditorPanel: React.FC<NetworkEditorPanelProps> = ({
  isVisible,
  nodeData,
  onClose,
  onSave,
  onApply
}) => {
  const { formData, handleChange, hasChanges, resetInitialData } = useNetworkEditorForm(nodeData);

  const handleApply = useCallback(() => {
    if (formData) {
      onApply(formData);
      resetInitialData();
    }
  }, [formData, onApply, resetInitialData]);

  const handleSave = useCallback(() => {
    if (formData) onSave(formData);
  }, [formData, onSave]);

  if (!formData) return null;

  return (
    <EditorPanel
      title="Network Editor"
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      storageKey="network-editor"
      width={380}
      hasChanges={hasChanges}
      testId="network-editor"
    >
      <NetworkEditorContent formData={formData} onChange={handleChange} />
    </EditorPanel>
  );
};
