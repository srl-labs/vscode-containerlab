/**
 * LabSettingsPanel - Configure lab settings with tabs for Basic and Management
 * Migrated from legacy TopoViewer panel-lab-settings.html
 */
import React, { useState, useEffect } from "react";

import { BasePanel } from "../../ui/editor/BasePanel";
import { useLabSettingsState } from "../../../hooks/panels/useLabSettings";

import { BasicTab } from "./BasicTab";
import { MgmtTab } from "./MgmtTab";
import type { LabSettings, TabId } from "./types";

interface LabSettingsPanelProps {
  isVisible: boolean;
  onClose: () => void;
  mode: "view" | "edit";
  isLocked?: boolean;
  labSettings?: LabSettings;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "basic-lab", label: "Basic" },
  { id: "mgmt", label: "Management" }
];

export const LabSettingsPanel: React.FC<LabSettingsPanelProps> = ({
  isVisible,
  onClose,
  mode,
  isLocked = true,
  labSettings
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("basic-lab");
  // Fields are read-only in view mode OR when locked in edit mode
  const isReadOnly = mode === "view" || isLocked;

  const state = useLabSettingsState(labSettings);

  // Handle save and close
  const handleSaveAndClose = async () => {
    await state.handleSave();
    onClose();
  };

  // Handle Escape key to close panel
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onClose]);

  return (
    <BasePanel
      title="Lab Settings"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 80, y: 80 }}
      width={400}
      storageKey="labSettings"
      zIndex={21}
      footer={!isReadOnly}
      onPrimaryClick={() => void handleSaveAndClose()}
      primaryLabel="Save"
      onSecondaryClick={onClose}
      secondaryLabel="Close"
      minWidth={350}
      minHeight={300}
      testId="lab-settings"
    >
      {/* Tab Navigation */}
      <div className="panel-tabs mb-3" style={{ justifyContent: "flex-start" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab-button ${activeTab === tab.id ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`panel-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Basic Tab */}
      {activeTab === "basic-lab" && (
        <BasicTab
          labName={state.basic.labName}
          prefixType={state.basic.prefixType}
          customPrefix={state.basic.customPrefix}
          isViewMode={isReadOnly}
          onLabNameChange={state.setBasic.setLabName}
          onPrefixTypeChange={state.setBasic.setPrefixType}
          onCustomPrefixChange={state.setBasic.setCustomPrefix}
        />
      )}

      {/* Management Tab */}
      {activeTab === "mgmt" && (
        <MgmtTab
          networkName={state.mgmt.networkName}
          ipv4Type={state.mgmt.ipv4Type}
          ipv4Subnet={state.mgmt.ipv4Subnet}
          ipv4Gateway={state.mgmt.ipv4Gateway}
          ipv4Range={state.mgmt.ipv4Range}
          ipv6Type={state.mgmt.ipv6Type}
          ipv6Subnet={state.mgmt.ipv6Subnet}
          ipv6Gateway={state.mgmt.ipv6Gateway}
          mtu={state.mgmt.mtu}
          bridge={state.mgmt.bridge}
          externalAccess={state.mgmt.externalAccess}
          driverOptions={state.mgmt.driverOptions}
          isViewMode={isReadOnly}
          onNetworkNameChange={state.setMgmt.setNetworkName}
          onIpv4TypeChange={state.setMgmt.setIpv4Type}
          onIpv4SubnetChange={state.setMgmt.setIpv4Subnet}
          onIpv4GatewayChange={state.setMgmt.setIpv4Gateway}
          onIpv4RangeChange={state.setMgmt.setIpv4Range}
          onIpv6TypeChange={state.setMgmt.setIpv6Type}
          onIpv6SubnetChange={state.setMgmt.setIpv6Subnet}
          onIpv6GatewayChange={state.setMgmt.setIpv6Gateway}
          onMtuChange={state.setMgmt.setMtu}
          onBridgeChange={state.setMgmt.setBridge}
          onExternalAccessChange={state.setMgmt.setExternalAccess}
          onAddDriverOption={state.driverOpts.add}
          onRemoveDriverOption={state.driverOpts.remove}
          onUpdateDriverOption={state.driverOpts.update}
        />
      )}
    </BasePanel>
  );
};
