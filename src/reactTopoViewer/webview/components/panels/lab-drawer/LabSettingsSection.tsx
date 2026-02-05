/**
 * LabSettingsSection - Lab settings for the Settings Drawer
 * Migrated from LabSettingsPanel
 */
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";

import { useLabSettingsState } from "../../../hooks/editor";
import { BasicTab } from "../lab-settings/BasicTab";
import { MgmtTab } from "../lab-settings/MgmtTab";
import type { LabSettings } from "../lab-settings/types";

interface LabSettingsSectionProps {
  mode: "view" | "edit";
  isLocked: boolean;
  labSettings?: LabSettings;
  onClose: () => void;
}

export const LabSettingsSection: React.FC<LabSettingsSectionProps> = ({
  mode,
  isLocked,
  labSettings,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const isReadOnly = mode === "view" || isLocked;

  const state = useLabSettingsState(labSettings);

  const handleSave = async () => {
    await state.handleSave();
    onClose();
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Lab Settings
      </Typography>

      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
        <Tab label="Basic" />
        <Tab label="Management" />
      </Tabs>

      {/* Basic Tab */}
      {activeTab === 0 && (
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
      {activeTab === 1 && (
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

      {/* Save Button - only show in edit mode when not locked */}
      {!isReadOnly && (
        <Box sx={{ mt: 3, display: "flex", gap: 1, justifyContent: "flex-end" }}>
          <Button variant="contained" size="small" onClick={() => void handleSave()}>
            Save
          </Button>
        </Box>
      )}
    </Box>
  );
};
