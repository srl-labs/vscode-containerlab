// Lab settings with Basic and Management tabs.
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import { useLabSettingsState } from "../../../hooks/editor";
import { saveViewerSettings } from "../../../services";
import { useTopoViewerStore } from "../../../stores/topoViewerStore";
import type { GridSettingsControlsProps } from "../GridSettingsPopover";
import { BasicTab } from "../lab-settings/BasicTab";
import { MgmtTab } from "../lab-settings/MgmtTab";
import { AppearanceTab } from "../lab-settings/AppearanceTab";
import type { LabSettings } from "../lab-settings/types";

export interface LabSettingsSectionProps extends GridSettingsControlsProps {
  mode: "view" | "edit";
  isLocked: boolean;
  labSettings?: LabSettings;
  onClose: () => void;
  saveRef?: React.RefObject<(() => Promise<void>) | null>;
}

export const LabSettingsSection: React.FC<LabSettingsSectionProps> = ({
  mode,
  isLocked,
  labSettings,
  onClose,
  saveRef,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  gridColor,
  onGridColorChange,
  gridBgColor,
  onGridBgColorChange,
  onResetGridColors
}) => {
  const [activeTab, setActiveTab] = useState("basic");
  const areTopologySettingsReadOnly = mode === "view" || isLocked;
  const isAppearanceReadOnly = isLocked;

  const state = useLabSettingsState(labSettings);
  const linkLabelMode = useTopoViewerStore((store) => store.linkLabelMode);
  const lastNonTelemetryLinkLabelMode = useTopoViewerStore(
    (store) => store.lastNonTelemetryLinkLabelMode
  );
  const telemetryNodeSizePx = useTopoViewerStore((store) => store.telemetryNodeSizePx);
  const telemetryInterfaceSizePercent = useTopoViewerStore(
    (store) => store.telemetryInterfaceSizePercent
  );

  const handleSave = async () => {
    if (!areTopologySettingsReadOnly) {
      await state.handleSave();
    }
    const style = linkLabelMode === "telemetry-style" ? "telemetry-style" : "default";
    const nextLastNonTelemetryLinkLabelMode =
      linkLabelMode === "telemetry-style" ? lastNonTelemetryLinkLabelMode : linkLabelMode;
    await saveViewerSettings({
      style,
      linkLabelMode,
      lastNonTelemetryLinkLabelMode: nextLastNonTelemetryLinkLabelMode,
      telemetryNodeSizePx,
      telemetryInterfaceSizePercent,
      gridLineWidth,
      gridStyle,
      gridColor,
      gridBgColor
    });
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
        <Tab label="Appearance" value="appearance" data-testid="lab-settings-tab-appearance" />
      </Tabs>
      <Divider />

      {activeTab === "basic" && (
        <Box sx={{ p: 2 }}>
          <BasicTab
            labName={state.basic.labName}
            prefixType={state.basic.prefixType}
            customPrefix={state.basic.customPrefix}
            isViewMode={areTopologySettingsReadOnly}
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
          isViewMode={areTopologySettingsReadOnly}
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

      {activeTab === "appearance" && (
        <Box sx={{ p: 2 }}>
          <AppearanceTab
            gridLineWidth={gridLineWidth}
            onGridLineWidthChange={onGridLineWidthChange}
            gridStyle={gridStyle}
            onGridStyleChange={onGridStyleChange}
            gridColor={gridColor}
            onGridColorChange={onGridColorChange}
            gridBgColor={gridBgColor}
            onGridBgColorChange={onGridBgColorChange}
            onResetGridColors={onResetGridColors}
            isReadOnly={isAppearanceReadOnly}
          />
        </Box>
      )}
    </Box>
  );
};
