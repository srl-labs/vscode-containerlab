/**
 * usePanelCommands - Hooks providing deployment callbacks and panel visibility management.
 *
 * Merged from usePanelVisibility.ts - manages panel visibility for shortcuts, about, find node, SVG export, lab settings, and bulk link.
 */
import { useCallback, useState } from "react";

import { sendCommandToExtension } from "../../messaging/extensionMessaging";

export interface DeploymentCommands {
  onDeploy: () => void;
  onDeployCleanup: () => void;
  onDestroy: () => void;
  onDestroyCleanup: () => void;
  onRedeploy: () => void;
  onRedeployCleanup: () => void;
}

// Keep deployment commands - they need extension to run containerlab CLI
export function useDeploymentCommands(): DeploymentCommands {
  return {
    onDeploy: useCallback(() => sendCommandToExtension("deployLab"), []),
    onDeployCleanup: useCallback(() => sendCommandToExtension("deployLabCleanup"), []),
    onDestroy: useCallback(() => sendCommandToExtension("destroyLab"), []),
    onDestroyCleanup: useCallback(() => sendCommandToExtension("destroyLabCleanup"), []),
    onRedeploy: useCallback(() => sendCommandToExtension("redeployLab"), []),
    onRedeployCleanup: useCallback(() => sendCommandToExtension("redeployLabCleanup"), [])
  };
}

// ============================================================================
// Panel Visibility Management (merged from usePanelVisibility.ts)
// ============================================================================

export interface PanelVisibility {
  showShortcutsPanel: boolean;
  showAboutPanel: boolean;
  showFindNodePanel: boolean;
  showSvgExportPanel: boolean;
  showLabSettingsPanel: boolean;
  showBulkLinkPanel: boolean;
  showNodePalettePanel: boolean;
  handleShowShortcuts: () => void;
  handleShowAbout: () => void;
  handleShowFindNode: () => void;
  handleShowSvgExport: () => void;
  handleShowLabSettings: () => void;
  handleShowBulkLink: () => void;
  handleShowNodePalette: () => void;
  handleCloseShortcuts: () => void;
  handleCloseAbout: () => void;
  handleCloseFindNode: () => void;
  handleCloseSvgExport: () => void;
  handleCloseLabSettings: () => void;
  handleCloseBulkLink: () => void;
  handleCloseNodePalette: () => void;
}

/** Hook for info panels (shortcuts/about) with mutual exclusivity */
function useInfoPanels() {
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);

  const handleShowShortcuts = useCallback(() => {
    setShowAboutPanel(false);
    setShowShortcutsPanel((prev) => !prev);
  }, []);

  const handleShowAbout = useCallback(() => {
    setShowShortcutsPanel(false);
    setShowAboutPanel((prev) => !prev);
  }, []);

  const handleCloseShortcuts = useCallback(() => setShowShortcutsPanel(false), []);
  const handleCloseAbout = useCallback(() => setShowAboutPanel(false), []);

  return {
    showShortcutsPanel,
    showAboutPanel,
    handleShowShortcuts,
    handleShowAbout,
    handleCloseShortcuts,
    handleCloseAbout
  };
}

/** Hook for utility panels (find node, SVG export, lab settings) */
function useUtilityPanels() {
  const [showFindNodePanel, setShowFindNodePanel] = useState(false);
  const [showSvgExportPanel, setShowSvgExportPanel] = useState(false);
  const [showLabSettingsPanel, setShowLabSettingsPanel] = useState(false);

  const handleShowFindNode = useCallback(() => setShowFindNodePanel((prev) => !prev), []);
  const handleShowSvgExport = useCallback(() => setShowSvgExportPanel((prev) => !prev), []);
  const handleShowLabSettings = useCallback(() => setShowLabSettingsPanel((prev) => !prev), []);

  const handleCloseFindNode = useCallback(() => setShowFindNodePanel(false), []);
  const handleCloseSvgExport = useCallback(() => setShowSvgExportPanel(false), []);
  const handleCloseLabSettings = useCallback(() => setShowLabSettingsPanel(false), []);

  return {
    showFindNodePanel,
    showSvgExportPanel,
    showLabSettingsPanel,
    handleShowFindNode,
    handleShowSvgExport,
    handleShowLabSettings,
    handleCloseFindNode,
    handleCloseSvgExport,
    handleCloseLabSettings
  };
}

function useEditorPanels() {
  const [showBulkLinkPanel, setShowBulkLinkPanel] = useState(false);
  const [showNodePalettePanel, setShowNodePalettePanel] = useState(false);

  const handleShowBulkLink = useCallback(() => setShowBulkLinkPanel(true), []);
  const handleCloseBulkLink = useCallback(() => setShowBulkLinkPanel(false), []);

  const handleShowNodePalette = useCallback(() => setShowNodePalettePanel((prev) => !prev), []);
  const handleCloseNodePalette = useCallback(() => setShowNodePalettePanel(false), []);

  return {
    showBulkLinkPanel,
    handleShowBulkLink,
    handleCloseBulkLink,
    showNodePalettePanel,
    handleShowNodePalette,
    handleCloseNodePalette
  };
}

export function usePanelVisibility(): PanelVisibility {
  const info = useInfoPanels();
  const utility = useUtilityPanels();
  const editor = useEditorPanels();

  return { ...info, ...utility, ...editor };
}
