/**
 * usePanelCommands - Hooks providing deployment callbacks and panel visibility management.
 *
 * Simplified for the new UI model:
 * - ContextPanel (left drawer) with auto-open on selection
 * - MUI Dialogs for modals (LabSettings, Shortcuts, SvgExport, BulkLink, About)
 * - MUI Popovers for Grid and Find (anchor-based)
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
// Panel Visibility Management
// ============================================================================

export interface PanelVisibility {
  // Context panel (left drawer)
  isContextPanelOpen: boolean;
  handleOpenContextPanel: () => void;
  handleCloseContextPanel: () => void;
  handleToggleContextPanel: () => void;

  // Modals
  showLabSettingsModal: boolean;
  showShortcutsModal: boolean;
  showSvgExportModal: boolean;
  showBulkLinkModal: boolean;
  showAboutPanel: boolean;
  handleShowLabSettings: () => void;
  handleShowShortcuts: () => void;
  handleShowSvgExport: () => void;
  handleShowBulkLink: () => void;
  handleShowAbout: () => void;
  handleCloseLabSettings: () => void;
  handleCloseShortcuts: () => void;
  handleCloseSvgExport: () => void;
  handleCloseBulkLink: () => void;
  handleCloseAbout: () => void;

  // Popovers (anchor element based)
  gridPopoverAnchor: HTMLElement | null;
  findPopoverAnchor: HTMLElement | null;
  handleOpenGridPopover: (anchor: HTMLElement) => void;
  handleCloseGridPopover: () => void;
  handleOpenFindPopover: (anchor: HTMLElement) => void;
  handleCloseFindPopover: () => void;
}

function useContextPanel() {
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);

  return {
    isContextPanelOpen,
    handleOpenContextPanel: useCallback(() => setIsContextPanelOpen(true), []),
    handleCloseContextPanel: useCallback(() => setIsContextPanelOpen(false), []),
    handleToggleContextPanel: useCallback(() => setIsContextPanelOpen((prev) => !prev), [])
  };
}

function useModals() {
  const [showLabSettingsModal, setShowLabSettingsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSvgExportModal, setShowSvgExportModal] = useState(false);
  const [showBulkLinkModal, setShowBulkLinkModal] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);

  return {
    showLabSettingsModal,
    showShortcutsModal,
    showSvgExportModal,
    showBulkLinkModal,
    showAboutPanel,
    handleShowLabSettings: useCallback(() => setShowLabSettingsModal(true), []),
    handleShowShortcuts: useCallback(() => setShowShortcutsModal(true), []),
    handleShowSvgExport: useCallback(() => setShowSvgExportModal(true), []),
    handleShowBulkLink: useCallback(() => setShowBulkLinkModal(true), []),
    handleShowAbout: useCallback(() => setShowAboutPanel((prev) => !prev), []),
    handleCloseLabSettings: useCallback(() => setShowLabSettingsModal(false), []),
    handleCloseShortcuts: useCallback(() => setShowShortcutsModal(false), []),
    handleCloseSvgExport: useCallback(() => setShowSvgExportModal(false), []),
    handleCloseBulkLink: useCallback(() => setShowBulkLinkModal(false), []),
    handleCloseAbout: useCallback(() => setShowAboutPanel(false), [])
  };
}

function usePopovers() {
  const [gridPopoverAnchor, setGridPopoverAnchor] = useState<HTMLElement | null>(null);
  const [findPopoverAnchor, setFindPopoverAnchor] = useState<HTMLElement | null>(null);

  return {
    gridPopoverAnchor,
    findPopoverAnchor,
    handleOpenGridPopover: useCallback((anchor: HTMLElement) => setGridPopoverAnchor(anchor), []),
    handleCloseGridPopover: useCallback(() => setGridPopoverAnchor(null), []),
    handleOpenFindPopover: useCallback((anchor: HTMLElement) => setFindPopoverAnchor(anchor), []),
    handleCloseFindPopover: useCallback(() => setFindPopoverAnchor(null), [])
  };
}

export function usePanelVisibility(): PanelVisibility {
  const contextPanel = useContextPanel();
  const modals = useModals();
  const popovers = usePopovers();

  return { ...contextPanel, ...modals, ...popovers };
}
