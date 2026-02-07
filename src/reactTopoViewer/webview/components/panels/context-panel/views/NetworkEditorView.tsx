/**
 * NetworkEditorView - Network editor content for the ContextPanel
 */
import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";

import { FormField, InputField, FilterableDropdown, Section, KeyValueList } from "../../../ui/form";

import type { NetworkEditorData, NetworkType } from "../../network-editor/types";
import {
  NETWORK_TYPES,
  VXLAN_TYPES,
  BRIDGE_TYPES,
  MACVLAN_MODES,
  getInterfaceLabel,
  getInterfacePlaceholder,
  showInterfaceField,
  supportsExtendedProps
} from "../../network-editor/types";

export interface NetworkEditorViewProps {
  nodeData: NetworkEditorData | null;
  onSave: (data: NetworkEditorData) => void;
  onApply: (data: NetworkEditorData) => void;
  onFooterRef?: (ref: NetworkEditorFooterRef | null) => void;
}

export interface NetworkEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

const NETWORK_TYPE_OPTIONS = NETWORK_TYPES.map((type) => ({ value: type, label: type }));
const MACVLAN_MODE_OPTIONS = MACVLAN_MODES.map((mode) => ({ value: mode, label: mode }));

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
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return { formData, handleChange, hasChanges, resetInitialData };
}

const NetworkEditorContent: React.FC<{
  formData: NetworkEditorData;
  onChange: (updates: Partial<NetworkEditorData>) => void;
}> = ({ formData, onChange }) => {
  const handleNetworkTypeChange = useCallback(
    (newType: NetworkType) => {
      const updates: Partial<NetworkEditorData> = { networkType: newType };
      if (!VXLAN_TYPES.includes(newType)) {
        updates.vxlanRemote = undefined;
        updates.vxlanVni = undefined;
        updates.vxlanDstPort = undefined;
        updates.vxlanSrcPort = undefined;
      }
      if (newType !== "macvlan") updates.macvlanMode = undefined;
      onChange(updates);
    },
    [onChange]
  );

  return (
    <div className="space-y-3">
      <FormField label="Network Type">
        <FilterableDropdown
          id="network-type"
          options={NETWORK_TYPE_OPTIONS}
          value={formData.networkType}
          onChange={(v) => handleNetworkTypeChange(v as NetworkType)}
          placeholder="Select network type..."
          allowFreeText={false}
        />
      </FormField>

      {showInterfaceField(formData.networkType) && (
        <FormField label={getInterfaceLabel(formData.networkType)}>
          <InputField
            id="network-interface"
            value={formData.interfaceName}
            onChange={(v) => onChange({ interfaceName: v })}
            placeholder={getInterfacePlaceholder(formData.networkType)}
          />
        </FormField>
      )}

      {(BRIDGE_TYPES.includes(formData.networkType) || VXLAN_TYPES.includes(formData.networkType)) && (
        <FormField label="Label / Alias">
          <InputField
            id="network-label"
            value={formData.label}
            onChange={(v) => onChange({ label: v })}
            placeholder="Display label for the network node"
          />
        </FormField>
      )}

      {formData.networkType === "macvlan" && (
        <FormField label="Mode">
          <FilterableDropdown
            id="macvlan-mode"
            options={MACVLAN_MODE_OPTIONS}
            value={formData.macvlanMode || "bridge"}
            onChange={(v) => onChange({ macvlanMode: v })}
            placeholder="Select mode..."
            allowFreeText={false}
          />
        </FormField>
      )}

      {VXLAN_TYPES.includes(formData.networkType) && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-[var(--vscode-foreground)] opacity-70 mt-4 mb-2">
            VXLAN Settings
          </div>
          <FormField label="Remote">
            <InputField
              id="vxlan-remote"
              value={formData.vxlanRemote || ""}
              onChange={(v) => onChange({ vxlanRemote: v })}
              placeholder="Remote endpoint IP address"
            />
          </FormField>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="VNI">
              <InputField id="vxlan-vni" value={formData.vxlanVni || ""} onChange={(v) => onChange({ vxlanVni: v })} placeholder="e.g., 100" />
            </FormField>
            <FormField label="Dst Port">
              <InputField id="vxlan-dst-port" value={formData.vxlanDstPort || ""} onChange={(v) => onChange({ vxlanDstPort: v })} placeholder="e.g., 4789" />
            </FormField>
            <FormField label="Src Port">
              <InputField id="vxlan-src-port" value={formData.vxlanSrcPort || ""} onChange={(v) => onChange({ vxlanSrcPort: v })} placeholder="e.g., 0" />
            </FormField>
          </div>
        </div>
      )}

      <FormField label="MAC Address">
        <InputField id="network-mac" value={formData.mac || ""} onChange={(v) => onChange({ mac: v })} placeholder="e.g., 00:11:22:33:44:55 (optional)" />
      </FormField>

      {supportsExtendedProps(formData.networkType) && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-[var(--vscode-foreground)] opacity-70 mt-4 mb-2">
            Extended Properties
          </div>
          <FormField label="MTU">
            <InputField id="network-mtu" type="number" value={formData.mtu || ""} onChange={(v) => onChange({ mtu: v })} placeholder="e.g., 9000" min={1} max={65535} />
          </FormField>
          <Section title="Vars">
            <KeyValueList items={formData.vars || {}} onChange={(items) => onChange({ vars: items })} keyPlaceholder="Variable name" valuePlaceholder="Value" addLabel="Add Variable" />
          </Section>
          <Section title="Labels">
            <KeyValueList items={formData.labels || {}} onChange={(items) => onChange({ labels: items })} keyPlaceholder="Label name" valuePlaceholder="Value" addLabel="Add Label" />
          </Section>
        </div>
      )}
    </div>
  );
};

export const NetworkEditorView: React.FC<NetworkEditorViewProps> = ({
  nodeData,
  onSave,
  onApply,
  onFooterRef
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

  useEffect(() => {
    if (onFooterRef) {
      onFooterRef(formData ? { handleApply, handleSave, hasChanges } : null);
    }
  }, [onFooterRef, formData, handleApply, handleSave, hasChanges]);

  if (!formData) return null;

  return (
    <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
      <NetworkEditorContent formData={formData} onChange={handleChange} />
    </Box>
  );
};
