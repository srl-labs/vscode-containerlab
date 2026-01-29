/**
 * Hook for managing custom node template editor state and handlers
 */
import { useMemo } from "react";

import type { CustomTemplateEditorData, NodeEditorData } from "../../../shared/types/editors";
import {
  convertCustomTemplateToEditorData,
  convertEditorDataToSaveData
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
 * Convert NodeEditorData back to CustomTemplateEditorData for state updates.
 * This ensures the editing state stays in sync after Apply.
 */
function convertEditorDataToTemplateData(
  data: NodeEditorData,
  originalTemplate: CustomTemplateEditorData | null
): CustomTemplateEditorData {
  return {
    id: originalTemplate?.id || data.id,
    isCustomTemplate: true,
    customName: data.customName || "",
    kind: data.kind || "",
    originalName: originalTemplate?.originalName,

    // Basic tab fields
    type: data.type,
    image: data.image,
    icon: data.icon,
    iconColor: data.iconColor,
    iconCornerRadius: data.iconCornerRadius,

    // Custom template specific
    baseName: data.baseName,
    interfacePattern: data.interfacePattern,
    isDefaultCustomNode: data.isDefaultCustomNode,

    // Configuration tab fields
    license: data.license,
    startupConfig: data.startupConfig,
    enforceStartupConfig: data.enforceStartupConfig,
    suppressStartupConfig: data.suppressStartupConfig,
    binds: data.binds,
    env: data.env,
    envFiles: data.envFiles,
    labels: data.labels,

    // Runtime tab fields
    user: data.user,
    entrypoint: data.entrypoint,
    cmd: data.cmd,
    exec: data.exec,
    restartPolicy: data.restartPolicy,
    autoRemove: data.autoRemove,
    startupDelay: data.startupDelay,

    // Network tab fields
    mgmtIpv4: data.mgmtIpv4,
    mgmtIpv6: data.mgmtIpv6,
    networkMode: data.networkMode,
    ports: data.ports,
    dnsServers: data.dnsServers,
    aliases: data.aliases,

    // Advanced tab fields
    cpu: data.cpu,
    cpuSet: data.cpuSet,
    memory: data.memory,
    shmSize: data.shmSize,
    capAdd: data.capAdd,
    sysctls: data.sysctls,
    devices: data.devices,
    certIssue: data.certIssue,
    certKeySize: data.certKeySize,
    certValidity: data.certValidity,
    sans: data.sans,
    healthCheck: data.healthCheck,
    imagePullPolicy: data.imagePullPolicy,
    runtime: data.runtime,

    // Components tab fields (SROS)
    isDistributed: data.isDistributed,
    components: data.components
  };
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
      }
    }),
    [editingCustomTemplate, editCustomTemplate]
  );

  return { editorData, handlers };
}
