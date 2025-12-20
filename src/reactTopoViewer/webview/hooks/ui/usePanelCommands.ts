/**
 * usePanelCommands - Hooks providing FloatingActionPanel callbacks.
 */
import { useCallback } from 'react';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

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
    onDeploy: useCallback(() => sendCommandToExtension('deployLab'), []),
    onDeployCleanup: useCallback(
      () => sendCommandToExtension('deployLabCleanup'),
      []
    ),
    onDestroy: useCallback(() => sendCommandToExtension('destroyLab'), []),
    onDestroyCleanup: useCallback(
      () => sendCommandToExtension('destroyLabCleanup'),
      []
    ),
    onRedeploy: useCallback(() => sendCommandToExtension('redeployLab'), []),
    onRedeployCleanup: useCallback(
      () => sendCommandToExtension('redeployLabCleanup'),
      []
    )
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
