/**
 * LabSettingsPanel - Configure lab settings with tabs for Basic and Management
 * Migrated from legacy TopoViewer panel-lab-settings.html
 */
import React, { useState } from 'react';
import { BasePanel } from '../../shared/editor/BasePanel';
import { BasicTab } from './BasicTab';
import { MgmtTab } from './MgmtTab';
import { useLabSettingsState } from '../../../hooks/panels/useLabSettings';
import type { LabSettings, TabId } from './types';

interface LabSettingsPanelProps {
  isVisible: boolean;
  onClose: () => void;
  mode: 'view' | 'edit';
  labSettings?: LabSettings;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic-lab', label: 'Basic' },
  { id: 'mgmt', label: 'Management' }
];

export const LabSettingsPanel: React.FC<LabSettingsPanelProps> = ({
  isVisible,
  onClose,
  mode,
  labSettings
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('basic-lab');
  const isViewMode = mode === 'view';

  const state = useLabSettingsState(labSettings);

  return (
    <BasePanel
      title="Lab Settings"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 80, y: 80 }}
      width={400}
      storageKey="labSettings"
      zIndex={21}
      footer={!isViewMode}
      onPrimaryClick={state.handleSave}
      primaryLabel="Save"
      onSecondaryClick={onClose}
      secondaryLabel="Close"
      minWidth={350}
      minHeight={300}
    >
      {/* Tab Navigation */}
      <div className="panel-tabs mb-3" style={{ justifyContent: 'flex-start' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab-button ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Basic Tab */}
      {activeTab === 'basic-lab' && (
        <BasicTab
          labName={state.basic.labName}
          prefixType={state.basic.prefixType}
          customPrefix={state.basic.customPrefix}
          isViewMode={isViewMode}
          onLabNameChange={state.setBasic.setLabName}
          onPrefixTypeChange={state.setBasic.setPrefixType}
          onCustomPrefixChange={state.setBasic.setCustomPrefix}
        />
      )}

      {/* Management Tab */}
      {activeTab === 'mgmt' && (
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
          isViewMode={isViewMode}
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
