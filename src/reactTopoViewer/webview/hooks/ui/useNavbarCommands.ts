/**
 * useNavbarCommands - Hook providing navbar command callbacks.
 */
import { useCallback } from 'react';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

export interface NavbarCommands {
  onLabSettings: () => void;
  onToggleSplit: () => void;
  onFindNode: () => void;
  onCaptureSvg: () => void;
  onLayoutToggle: () => void;
}

export function useNavbarCommands(): NavbarCommands {
  const onLabSettings = useCallback(
    () => sendCommandToExtension('nav-open-lab-settings'),
    []
  );
  const onToggleSplit = useCallback(
    () => sendCommandToExtension('topo-toggle-split-view'),
    []
  );
  const onFindNode = useCallback(
    () => sendCommandToExtension('nav-find-node'),
    []
  );
  const onCaptureSvg = useCallback(
    () => sendCommandToExtension('nav-capture-svg'),
    []
  );
  const onLayoutToggle = useCallback(
    () => sendCommandToExtension('nav-layout-toggle'),
    []
  );

  return {
    onLabSettings,
    onToggleSplit,
    onFindNode,
    onCaptureSvg,
    onLayoutToggle
  };
}

