/**
 * usePanelCommands - Hooks providing FloatingActionPanel callbacks.
 */
import { useCallback } from 'react';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

/** Command constants to avoid duplicate strings */
const CMD_PANEL_ADD_NODE = 'panel-add-node';

export interface DeploymentCommands {
  onDeploy: () => void;
  onDeployCleanup: () => void;
  onDestroy: () => void;
  onDestroyCleanup: () => void;
  onRedeploy: () => void;
  onRedeployCleanup: () => void;
}

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

export function useEditorPanelCommands(): EditorPanelCommands {
  return {
    onAddNode: useCallback((kind?: string) => {
      sendCommandToExtension(CMD_PANEL_ADD_NODE, { kind });
    }, []),
    onAddNetwork: useCallback((networkType?: string) => {
      sendCommandToExtension('panel-add-network', {
        networkType: networkType || 'host'
      });
    }, []),
    onAddGroup: useCallback(
      () => sendCommandToExtension('panel-add-group'),
      []
    ),
    onAddText: useCallback(
      () => sendCommandToExtension('panel-add-text'),
      []
    ),
    onAddShapes: useCallback((shapeType?: string) => {
      sendCommandToExtension('panel-add-shapes', {
        shapeType: shapeType || 'rectangle'
      });
    }, []),
    onAddBulkLink: useCallback(
      () => sendCommandToExtension('panel-add-bulk-link'),
      []
    )
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

