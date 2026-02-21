// Tab strip with divider.
import React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Divider from "@mui/material/Divider";

export interface TabDefinition {
  id: string;
  label: string;
  hidden?: boolean;
}

interface TabNavigationProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ tabs, activeTab, onTabChange }) => {
  const visibleTabs = tabs.filter((t) => t.hidden !== true);

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    onTabChange(newValue);
  };

  return (
    <>
      <Tabs value={activeTab} onChange={handleChange} variant="scrollable" scrollButtons="auto">
        {visibleTabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={tab.label}
            data-tab={tab.id}
            data-testid={`panel-tab-${tab.id}`}
          />
        ))}
      </Tabs>
      <Divider />
    </>
  );
};
