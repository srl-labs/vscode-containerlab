/**
 * usePanelVisibility - Manages panel visibility for shortcuts, about, find node, SVG export, and lab settings.
 */
import { useCallback, useState } from 'react';

export interface PanelVisibility {
  showShortcutsPanel: boolean;
  showAboutPanel: boolean;
  showFindNodePanel: boolean;
  showSvgExportPanel: boolean;
  showLabSettingsPanel: boolean;
  handleShowShortcuts: () => void;
  handleShowAbout: () => void;
  handleShowFindNode: () => void;
  handleShowSvgExport: () => void;
  handleShowLabSettings: () => void;
  handleCloseShortcuts: () => void;
  handleCloseAbout: () => void;
  handleCloseFindNode: () => void;
  handleCloseSvgExport: () => void;
  handleCloseLabSettings: () => void;
}

/** Hook for info panels (shortcuts/about) with mutual exclusivity */
function useInfoPanels() {
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);

  const handleShowShortcuts = useCallback(() => {
    setShowAboutPanel(false);
    setShowShortcutsPanel(prev => !prev);
  }, []);

  const handleShowAbout = useCallback(() => {
    setShowShortcutsPanel(false);
    setShowAboutPanel(prev => !prev);
  }, []);

  const handleCloseShortcuts = useCallback(() => setShowShortcutsPanel(false), []);
  const handleCloseAbout = useCallback(() => setShowAboutPanel(false), []);

  return { showShortcutsPanel, showAboutPanel, handleShowShortcuts, handleShowAbout, handleCloseShortcuts, handleCloseAbout };
}

/** Hook for utility panels (find node, SVG export, lab settings) */
function useUtilityPanels() {
  const [showFindNodePanel, setShowFindNodePanel] = useState(false);
  const [showSvgExportPanel, setShowSvgExportPanel] = useState(false);
  const [showLabSettingsPanel, setShowLabSettingsPanel] = useState(false);

  const handleShowFindNode = useCallback(() => setShowFindNodePanel(prev => !prev), []);
  const handleShowSvgExport = useCallback(() => setShowSvgExportPanel(prev => !prev), []);
  const handleShowLabSettings = useCallback(() => setShowLabSettingsPanel(prev => !prev), []);

  const handleCloseFindNode = useCallback(() => setShowFindNodePanel(false), []);
  const handleCloseSvgExport = useCallback(() => setShowSvgExportPanel(false), []);
  const handleCloseLabSettings = useCallback(() => setShowLabSettingsPanel(false), []);

  return {
    showFindNodePanel, showSvgExportPanel, showLabSettingsPanel,
    handleShowFindNode, handleShowSvgExport, handleShowLabSettings,
    handleCloseFindNode, handleCloseSvgExport, handleCloseLabSettings
  };
}

export function usePanelVisibility(): PanelVisibility {
  const info = useInfoPanels();
  const utility = useUtilityPanels();

  return { ...info, ...utility };
}

