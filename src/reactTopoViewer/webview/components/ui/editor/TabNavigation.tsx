/**
 * TabNavigation - Scrollable tab strip with arrow buttons
 */
import React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";

export interface TabDefinition {
  id: string;
  label: string;
  hidden?: boolean;
}

interface TabNavigationProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  showArrows?: boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange
}) => {
  const visibleTabs = tabs.filter((t) => !t.hidden);

  const handleChange = (_event: React.SyntheticEvent, newValue: string) => {
    onTabChange(newValue);
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Tabs
        value={activeTab}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 36,
          "& .MuiTab-root": {
            minHeight: 36,
            py: 0.5,
            px: 2,
            textTransform: "none",
            fontSize: "0.8125rem"
          }
        }}
      >
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
    </Box>
  );
};
