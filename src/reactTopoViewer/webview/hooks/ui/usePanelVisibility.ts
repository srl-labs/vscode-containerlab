/**
 * usePanelVisibility - Manages shortcuts/about panel visibility.
 */
import { useCallback, useState } from 'react';

export interface PanelVisibility {
  showShortcutsPanel: boolean;
  showAboutPanel: boolean;
  handleShowShortcuts: () => void;
  handleShowAbout: () => void;
  handleCloseShortcuts: () => void;
  handleCloseAbout: () => void;
}

export function usePanelVisibility(): PanelVisibility {
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

  const handleCloseShortcuts = useCallback(
    () => setShowShortcutsPanel(false),
    []
  );
  const handleCloseAbout = useCallback(
    () => setShowAboutPanel(false),
    []
  );

  return {
    showShortcutsPanel,
    showAboutPanel,
    handleShowShortcuts,
    handleShowAbout,
    handleCloseShortcuts,
    handleCloseAbout
  };
}

