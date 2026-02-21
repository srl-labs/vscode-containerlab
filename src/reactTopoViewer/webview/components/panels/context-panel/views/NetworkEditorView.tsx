// Network editor content for the ContextPanel.
import React, { useCallback } from "react";
import Box from "@mui/material/Box";

import {
  InputField,
  FilterableDropdown,
  Section,
  KeyValueList,
  PanelSection
} from "../../../ui/form";
import { EditorPanel } from "../../../ui/editor/EditorPanel";
import { useApplySaveHandlers, useFooterControlsRef } from "../../../../hooks/ui";
import { useNetworkEditorForm } from "../../../../hooks/editor/useNetworkEditorForm";
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
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
  onFooterRef?: (ref: NetworkEditorFooterRef | null) => void;
}

export interface NetworkEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

const NETWORK_TYPE_OPTIONS = NETWORK_TYPES.map((type) => ({ value: type, label: type }));
const MACVLAN_MODE_OPTIONS = MACVLAN_MODES.map((mode) => ({ value: mode, label: mode }));

function isNetworkType(value: string): value is NetworkType {
  switch (value) {
    case "host":
    case "mgmt-net":
    case "macvlan":
    case "vxlan":
    case "vxlan-stitch":
    case "dummy":
    case "bridge":
    case "ovs-bridge":
      return true;
    default:
      return false;
  }
}

// This form is intentionally dense (conditional sections depend on network type).
/* eslint-disable complexity */
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
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Network Configuration" withTopDivider={false}>
        <FilterableDropdown
          id="network-type"
          label="Network Type"
          options={NETWORK_TYPE_OPTIONS}
          value={formData.networkType}
          onChange={(v) => {
            if (isNetworkType(v)) {
              handleNetworkTypeChange(v);
            }
          }}
          placeholder="Select network type..."
          allowFreeText={false}
        />

        {showInterfaceField(formData.networkType) && (
          <InputField
            id="network-interface"
            label={getInterfaceLabel(formData.networkType)}
            value={formData.interfaceName}
            onChange={(v) => onChange({ interfaceName: v })}
            placeholder={getInterfacePlaceholder(formData.networkType)}
          />
        )}

        {(BRIDGE_TYPES.includes(formData.networkType) ||
          VXLAN_TYPES.includes(formData.networkType)) && (
          <InputField
            id="network-label"
            label="Label / Alias"
            value={formData.label}
            onChange={(v) => onChange({ label: v })}
            placeholder="Display label for the network node"
          />
        )}

        {formData.networkType === "macvlan" && (
          <FilterableDropdown
            id="macvlan-mode"
            label="Mode"
            options={MACVLAN_MODE_OPTIONS}
            value={formData.macvlanMode ?? "bridge"}
            onChange={(v) => onChange({ macvlanMode: v })}
            placeholder="Select mode..."
            allowFreeText={false}
          />
        )}

        <InputField
          id="network-mac"
          label="MAC Address"
          value={formData.mac ?? ""}
          onChange={(v) => onChange({ mac: v })}
          placeholder="e.g., 00:11:22:33:44:55 (optional)"
        />
      </PanelSection>

      {/* VXLAN Settings */}
      {VXLAN_TYPES.includes(formData.networkType) && (
        <PanelSection title="VXLAN Settings">
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <InputField
              id="vxlan-remote"
              label="Remote"
              value={formData.vxlanRemote ?? ""}
              onChange={(v) => onChange({ vxlanRemote: v })}
              placeholder="Remote endpoint IP address"
            />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
              <InputField
                id="vxlan-vni"
                label="VNI"
                value={formData.vxlanVni ?? ""}
                onChange={(v) => onChange({ vxlanVni: v })}
                placeholder="e.g., 100"
              />
              <InputField
                id="vxlan-dst-port"
                label="Dst Port"
                value={formData.vxlanDstPort ?? ""}
                onChange={(v) => onChange({ vxlanDstPort: v })}
                placeholder="e.g., 4789"
              />
              <InputField
                id="vxlan-src-port"
                label="Src Port"
                value={formData.vxlanSrcPort ?? ""}
                onChange={(v) => onChange({ vxlanSrcPort: v })}
                placeholder="e.g., 0"
              />
            </Box>
          </Box>
        </PanelSection>
      )}

      {/* Extended Properties */}
      {supportsExtendedProps(formData.networkType) && (
        <PanelSection title="Extended Properties">
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <InputField
              id="network-mtu"
              label="MTU"
              type="number"
              value={formData.mtu ?? ""}
              onChange={(v) => onChange({ mtu: v })}
              placeholder="e.g., 9000"
              min={1}
              max={65535}
            />
            <Section title="Vars">
              <KeyValueList
                items={formData.vars ?? {}}
                onChange={(items) => onChange({ vars: items })}
                keyPlaceholder="Variable name"
                valuePlaceholder="Value"
                addLabel="Add Variable"
              />
            </Section>
            <Section title="Labels">
              <KeyValueList
                items={formData.labels ?? {}}
                onChange={(items) => onChange({ labels: items })}
                keyPlaceholder="Label name"
                valuePlaceholder="Value"
                addLabel="Add Label"
              />
            </Section>
          </Box>
        </PanelSection>
      )}
    </Box>
  );
};
/* eslint-enable complexity */

export const NetworkEditorView: React.FC<NetworkEditorViewProps> = ({
  nodeData,
  onSave,
  onApply,
  readOnly = false,
  onFooterRef
}) => {
  const { formData, handleChange, hasChanges, resetInitialData, discardChanges } =
    useNetworkEditorForm(nodeData, readOnly);

  const { handleApply, handleSave } = useApplySaveHandlers(
    formData,
    onApply,
    onSave,
    resetInitialData
  );

  useFooterControlsRef(
    onFooterRef,
    Boolean(formData),
    handleApply,
    handleSave,
    hasChanges,
    discardChanges
  );

  if (!formData) return null;

  return (
    <EditorPanel readOnly={readOnly}>
      <NetworkEditorContent formData={formData} onChange={handleChange} />
    </EditorPanel>
  );
};
