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
  // These are now no-ops as they're handled in the webview
  const onLabSettings = useCallback(() => {
    // Lab settings can be a webview modal
  }, []);

  // Keep this one - needs extension to open VS Code editor panel
  const onToggleSplit = useCallback(
    () => sendCommandToExtension('topo-toggle-split-view'),
    []
  );

  const onFindNode = useCallback(() => {
    // Find node is handled by webview search UI
  }, []);

  const onCaptureSvg = useCallback(() => {
    // SVG capture can use browser download API
  }, []);

  const onLayoutToggle = useCallback(() => {
    // Layout toggle is webview state
  }, []);

  return {
    onLabSettings,
    onToggleSplit,
    onFindNode,
    onCaptureSvg,
    onLayoutToggle
  };
}
