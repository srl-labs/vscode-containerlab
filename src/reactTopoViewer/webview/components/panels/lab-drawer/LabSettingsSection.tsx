// Lab settings with Basic and Management tabs.
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import { useLabSettingsState } from "../../../hooks/editor";
import { BasicTab } from "../lab-settings/BasicTab";
import { MgmtTab } from "../lab-settings/MgmtTab";
import type { LabSettings } from "../lab-settings/types";

export interface LabSettingsSectionProps {
  mode: "view" | "edit";
  isLocked: boolean;
  labSettings?: LabSettings;
  onClose: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export const LabSettingsSection: React.FC<LabSettingsSectionProps> = ({
  mode,
  isLocked,
  labSettings,
  onClose,
  saveRef
}) => {
  const [activeTab, setActiveTab] = useState("basic");
  const isReadOnly = mode === "view" || isLocked;

  const state = useLabSettingsState(labSettings);

  const handleSave = async () => {
    await state.handleSave();
    onClose();
  };

  if (saveRef) saveRef.current = handleSave;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper" }}
      >
        <Tab label="Basic" value="basic" data-testid="lab-settings-tab-basic" />
        <Tab label="Management Network" value="mgmt" data-testid="lab-settings-tab-mgmt" />
      </Tabs>
      <Divider />

      {activeTab === "basic" && (
        <Box sx={{ p: 2 }}>
          <BasicTab
            labName={state.basic.labName}
            prefixType={state.basic.prefixType}
            customPrefix={state.basic.customPrefix}
            isViewMode={isReadOnly}
            onLabNameChange={state.setBasic.setLabName}
            onPrefixTypeChange={state.setBasic.setPrefixType}
            onCustomPrefixChange={state.setBasic.setCustomPrefix}
          />
        </Box>
      )}

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
          onSetDriverOptions={state.driverOpts.setAll}
        />
      )}
    </Box>
  );
};
