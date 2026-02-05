/**
 * LabDrawer - Unified lab drawer for TopoViewer
 * Consolidates Lab Settings, Palette, Grid, Find Node, and Shortcuts panels
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import SettingsIcon from "@mui/icons-material/Settings";
import GridOnIcon from "@mui/icons-material/GridOn";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import CloseIcon from "@mui/icons-material/Close";
import DashboardIcon from "@mui/icons-material/Dashboard";

import type { GridStyle } from "../../../hooks/ui";
import type { LabSettings } from "../lab-settings/types";

import { LabSettingsSection } from "./LabSettingsSection";
import { GridSettingsSection } from "./GridSettingsSection";
import { FindNodeSection } from "./FindNodeSection";
import { ShortcutsSection } from "./ShortcutsSection";
import { PaletteSection } from "./PaletteSection";

export type LabDrawerSection =
  | "labSettings"
  | "palette"
  | "grid"
  | "findNode"
  | "shortcuts";

interface LabDrawerProps {
  isOpen: boolean;
  activeSection: LabDrawerSection;
  onSectionChange: (section: LabDrawerSection) => void;
  onClose: () => void;
  // Lab Settings props
  mode: "view" | "edit";
  isLocked: boolean;
  labSettings?: LabSettings;
  // Palette props
  onEditCustomNode?: (nodeName: string) => void;
  onDeleteCustomNode?: (nodeName: string) => void;
  onSetDefaultCustomNode?: (nodeName: string) => void;
  // Grid Settings props
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  gridStyle: GridStyle;
  onGridStyleChange: (style: GridStyle) => void;
  // Find Node props
  rfInstance: ReactFlowInstance | null;
}

const DRAWER_WIDTH = 480;

interface TabItem {
  id: LabDrawerSection;
  label: string;
  icon: React.ReactElement;
}

const TAB_ITEMS: TabItem[] = [
  { id: "labSettings", label: "Lab", icon: <SettingsIcon fontSize="small" /> },
  { id: "palette", label: "Palette", icon: <DashboardIcon fontSize="small" /> },
  { id: "grid", label: "Grid", icon: <GridOnIcon fontSize="small" /> },
  { id: "findNode", label: "Find", icon: <SearchIcon fontSize="small" /> },
  { id: "shortcuts", label: "Keys", icon: <KeyboardIcon fontSize="small" /> }
];

export const LabDrawer: React.FC<LabDrawerProps> = ({
  isOpen,
  activeSection,
  onSectionChange,
  onClose,
  mode,
  isLocked,
  labSettings,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  rfInstance
}) => {
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    onSectionChange(TAB_ITEMS[newValue].id);
  };

  const activeTabIndex = TAB_ITEMS.findIndex((item) => item.id === activeSection);

  const renderSection = () => {
    switch (activeSection) {
      case "labSettings":
        return (
          <LabSettingsSection
            mode={mode}
            isLocked={isLocked}
            labSettings={labSettings}
            onClose={onClose}
          />
        );
      case "palette":
        return (
          <PaletteSection
            onEditCustomNode={onEditCustomNode}
            onDeleteCustomNode={onDeleteCustomNode}
            onSetDefaultCustomNode={onSetDefaultCustomNode}
          />
        );
      case "grid":
        return (
          <GridSettingsSection
            gridLineWidth={gridLineWidth}
            onGridLineWidthChange={onGridLineWidthChange}
            gridStyle={gridStyle}
            onGridStyleChange={onGridStyleChange}
          />
        );
      case "findNode":
        return <FindNodeSection rfInstance={rfInstance} isVisible={isOpen} />;
      case "shortcuts":
        return <ShortcutsSection />;
      default:
        return null;
    }
  };

  return (
    <Drawer
      anchor="left"
      variant="persistent"
      open={isOpen}
      sx={{
        width: isOpen ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          position: "relative",
          boxSizing: "border-box"
        }
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header with title and close button */}
        <Box
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Lab Panel
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Horizontal tabs */}
        <Tabs
          value={activeTabIndex}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              minWidth: 0,
              px: 1,
              py: 0.5
            }
          }}
        >
          {TAB_ITEMS.map((item) => (
            <Tab
              key={item.id}
              icon={item.icon}
              iconPosition="start"
              label={item.label}
              sx={{ textTransform: "none", fontSize: "0.75rem" }}
            />
          ))}
        </Tabs>

        {/* Content area */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto",
            bgcolor: "var(--vscode-editor-background)"
          }}
        >
          {renderSection()}
        </Box>
      </Box>
    </Drawer>
  );
};
