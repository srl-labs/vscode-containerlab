/**
 * Hook for managing custom node template editor state and handlers
 */
import { useMemo } from "react";

import type { CustomTemplateEditorData, NodeEditorData } from "../../../shared/types/editors";
import {
  convertCustomTemplateToEditorData,
  convertEditorDataToSaveData,
  convertEditorDataToTemplateData,
} from "../../../shared/utilities/customNodeConversions";
import { sendSaveCustomNode } from "../../messaging/extensionMessaging";

export interface CustomTemplateEditorHandlers {
  handleClose: () => void;
  handleSave: (data: NodeEditorData) => void;
  handleApply: (data: NodeEditorData) => void;
}

export interface CustomTemplateEditorResult {
  editorData: NodeEditorData | null;
  handlers: CustomTemplateEditorHandlers;
}

/**
 * Hook for custom template editor state and handlers
 *
 * @param editingCustomTemplate - Current custom template being edited (from context state)
 * @param editCustomTemplate - Action to set/clear the editing template (from context)
 * @returns Editor data converted for NodeEditorPanel and handlers for save/close/apply
 */
export function useCustomTemplateEditor(
  editingCustomTemplate: CustomTemplateEditorData | null,
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void
): CustomTemplateEditorResult {
  const editorData = useMemo(() => {
    if (!editingCustomTemplate) return null;
    return convertCustomTemplateToEditorData(editingCustomTemplate);
  }, [editingCustomTemplate]);

  const handlers = useMemo<CustomTemplateEditorHandlers>(
    () => ({
      handleClose: () => editCustomTemplate(null),
      handleSave: (data: NodeEditorData) => {
        const saveData = convertEditorDataToSaveData(data, editingCustomTemplate?.originalName);
        sendSaveCustomNode(saveData);
        editCustomTemplate(null);
      },
      handleApply: (data: NodeEditorData) => {
        const saveData = convertEditorDataToSaveData(data, editingCustomTemplate?.originalName);
        sendSaveCustomNode(saveData);
        // Update editingCustomTemplate with applied values to keep form in sync
        // This prevents the form from resetting when custom-nodes-updated triggers a re-render
        const updatedTemplate = convertEditorDataToTemplateData(data, editingCustomTemplate);
        editCustomTemplate(updatedTemplate);
      },
    }),
    [editingCustomTemplate, editCustomTemplate]
  );

  return { editorData, handlers };
}
