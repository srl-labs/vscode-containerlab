/**
 * Hook for custom node template UI commands (edit, delete, set-default, new)
 */
import { useCallback } from 'react';

import type { CustomNodeTemplate, CustomTemplateEditorData } from '../../../shared/types/editors';
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from '../../../shared/utilities/customNodeConversions';
import { sendDeleteCustomNode, sendSetDefaultCustomNode } from '../../utils/extensionMessaging';

export interface CustomNodeCommands {
  /** Open editor to create a new custom node template */
  onNewCustomNode: () => void;
  /** Open editor to edit an existing custom node template */
  onEditCustomNode: (nodeName: string) => void;
  /** Delete a custom node template */
  onDeleteCustomNode: (nodeName: string) => void;
  /** Set a custom node template as the default */
  onSetDefaultCustomNode: (nodeName: string) => void;
}

/**
 * Hook for custom node template UI commands
 *
 * @param customNodes - Array of custom node templates from context state
 * @param editCustomTemplate - Action to open the custom template editor (from context)
 * @returns Object with callbacks for new, edit, delete, and set-default actions
 */
export function useCustomNodeCommands(
  customNodes: CustomNodeTemplate[],
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void
): CustomNodeCommands {
  const onNewCustomNode = useCallback(() => {
    const templateData = createNewTemplateEditorData();
    editCustomTemplate(templateData);
  }, [editCustomTemplate]);

  const onEditCustomNode = useCallback((nodeName: string) => {
    const template = customNodes.find(n => n.name === nodeName);
    if (!template) return;
    const templateData = convertTemplateToEditorData(template);
    editCustomTemplate(templateData);
  }, [customNodes, editCustomTemplate]);

  const onDeleteCustomNode = useCallback((nodeName: string) => {
    sendDeleteCustomNode(nodeName);
  }, []);

  const onSetDefaultCustomNode = useCallback((nodeName: string) => {
    sendSetDefaultCustomNode(nodeName);
  }, []);

  return {
    onNewCustomNode,
    onEditCustomNode,
    onDeleteCustomNode,
    onSetDefaultCustomNode
  };
}
