/**
 * usePanelCommands - Hooks providing FloatingActionPanel callbacks and panel visibility management.
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

export interface EditorPanelCommands {
  onAddNode: (kind?: string) => void;
  onAddNetwork: (networkType?: string) => void;
  onAddGroup: () => void;
  onAddText: () => void;
  onAddShapes: (shapeType?: string) => void;
  onAddBulkLink: () => void;
}

// These are now no-ops - panels are handled in webview
export function useEditorPanelCommands(): EditorPanelCommands {
  return {
    onAddNode: useCallback((_kind?: string) => {
      // Node creation is handled via shift+click or context menu
    }, []),
    onAddNetwork: useCallback((_networkType?: string) => {
      // Network creation handled in webview
    }, []),
    onAddGroup: useCallback(() => {
      // Group creation handled in webview
    }, []),
    onAddText: useCallback(() => {
      // Text annotation handled in webview
    }, []),
    onAddShapes: useCallback((_shapeType?: string) => {
      // Shape annotation handled in webview
    }, []),
    onAddBulkLink: useCallback(() => {
      // Bulk link panel handled in webview
    }, [])
  };
}

export type FloatingPanelCommands = DeploymentCommands & EditorPanelCommands;

export function useFloatingPanelCommands(): FloatingPanelCommands {
  const deploymentCommands = useDeploymentCommands();
  const editorCommands = useEditorPanelCommands();
  return {
    ...deploymentCommands,
    ...editorCommands
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
  handleShowShortcuts: () => void;
  handleShowAbout: () => void;
  handleShowFindNode: () => void;
  handleShowSvgExport: () => void;
  handleShowLabSettings: () => void;
  handleShowBulkLink: () => void;
  handleCloseShortcuts: () => void;
  handleCloseAbout: () => void;
  handleCloseFindNode: () => void;
  handleCloseSvgExport: () => void;
  handleCloseLabSettings: () => void;
  handleCloseBulkLink: () => void;
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

  const handleShowBulkLink = useCallback(() => setShowBulkLinkPanel(true), []);
  const handleCloseBulkLink = useCallback(() => setShowBulkLinkPanel(false), []);

  return { showBulkLinkPanel, handleShowBulkLink, handleCloseBulkLink };
}

export function usePanelVisibility(): PanelVisibility {
  const info = useInfoPanels();
  const utility = useUtilityPanels();
  const editor = useEditorPanels();

  return { ...info, ...utility, ...editor };
}
