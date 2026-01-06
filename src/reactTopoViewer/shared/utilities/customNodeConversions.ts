/**
 * Utility functions for converting between CustomTemplateEditorData and NodeEditorData/SaveCustomNodeData
 */

import type { NodeEditorData, CustomTemplateEditorData, CustomNodeTemplate, HealthCheckConfig, SrosComponent } from '../types/editors';

/**
 * Data format for saving custom node to extension.
 * Extends CustomNodeTemplate with oldName for update operations.
 */
export interface SaveCustomNodeData extends Omit<CustomNodeTemplate, 'name'> {
  name: string;
  oldName?: string;
}

/**
 * Convert CustomTemplateEditorData to NodeEditorData for the node editor panel.
 * Includes all configurable fields so they appear in the editor.
 */
export function convertCustomTemplateToEditorData(template: CustomTemplateEditorData): NodeEditorData {
  return {
    id: template.id,
    name: '', // Not used for custom templates
    isCustomTemplate: true,
    customName: template.customName,
    kind: template.kind,

    // Basic tab fields
    type: template.type,
    image: template.image,
    icon: template.icon,
    iconColor: template.iconColor,
    iconCornerRadius: template.iconCornerRadius,

    // Custom template specific
    baseName: template.baseName,
    interfacePattern: template.interfacePattern,
    isDefaultCustomNode: template.isDefaultCustomNode,

    // Configuration tab fields
    license: template.license,
    startupConfig: template.startupConfig,
    enforceStartupConfig: template.enforceStartupConfig,
    suppressStartupConfig: template.suppressStartupConfig,
    binds: template.binds,
    env: template.env,
    envFiles: template.envFiles,
    labels: template.labels,

    // Runtime tab fields
    user: template.user,
    entrypoint: template.entrypoint,
    cmd: template.cmd,
    exec: template.exec,
    restartPolicy: template.restartPolicy,
    autoRemove: template.autoRemove,
    startupDelay: template.startupDelay,

    // Network tab fields
    mgmtIpv4: template.mgmtIpv4,
    mgmtIpv6: template.mgmtIpv6,
    networkMode: template.networkMode,
    ports: template.ports,
    dnsServers: template.dnsServers,
    aliases: template.aliases,

    // Advanced tab fields
    cpu: template.cpu,
    cpuSet: template.cpuSet,
    memory: template.memory,
    shmSize: template.shmSize,
    capAdd: template.capAdd,
    sysctls: template.sysctls,
    devices: template.devices,
    certIssue: template.certIssue,
    certKeySize: template.certKeySize,
    certValidity: template.certValidity,
    sans: template.sans,
    healthCheck: template.healthCheck,
    imagePullPolicy: template.imagePullPolicy,
    runtime: template.runtime,

    // Components tab fields (SROS)
    isDistributed: template.isDistributed,
    components: template.components,
  };
}

/**
 * Convert NodeEditorData back to SaveCustomNodeData format for extension.
 * Includes all configurable node properties so custom templates can have
 * default values for license, startup-config, env, binds, etc.
 */
export function convertEditorDataToSaveData(
  data: NodeEditorData,
  originalName?: string
): SaveCustomNodeData {
  return {
    // Required fields
    name: data.customName || '',
    oldName: originalName,
    kind: data.kind || '',

    // Basic tab fields
    type: data.type,
    image: data.image,
    icon: data.icon,
    iconColor: data.iconColor,
    iconCornerRadius: data.iconCornerRadius,

    // Custom template specific
    baseName: data.baseName,
    interfacePattern: data.interfacePattern,
    setDefault: data.isDefaultCustomNode,

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
    components: data.components,
  };
}

/**
 * Convert CustomNodeTemplate to CustomTemplateEditorData for editing.
 * Loads all saved template properties so they appear in the editor.
 */
export function convertTemplateToEditorData(template: CustomNodeTemplate): CustomTemplateEditorData {
  // Use type assertion for accessing extended properties
  const t = template as Record<string, unknown>;

  return {
    id: 'edit-custom-node',
    isCustomTemplate: true,
    customName: template.name,
    kind: template.kind,
    originalName: template.name,

    // Basic tab fields
    type: template.type,
    image: template.image,
    icon: template.icon,
    iconColor: t.iconColor as string | undefined,
    iconCornerRadius: t.iconCornerRadius as number | undefined,

    // Custom template specific
    baseName: template.baseName,
    interfacePattern: template.interfacePattern,
    isDefaultCustomNode: template.setDefault,

    // Configuration tab fields
    license: t.license as string | undefined,
    startupConfig: t.startupConfig as string | undefined,
    enforceStartupConfig: t.enforceStartupConfig as boolean | undefined,
    suppressStartupConfig: t.suppressStartupConfig as boolean | undefined,
    binds: t.binds as string[] | undefined,
    env: t.env as Record<string, string> | undefined,
    envFiles: t.envFiles as string[] | undefined,
    labels: t.labels as Record<string, string> | undefined,

    // Runtime tab fields
    user: t.user as string | undefined,
    entrypoint: t.entrypoint as string | undefined,
    cmd: t.cmd as string | undefined,
    exec: t.exec as string[] | undefined,
    restartPolicy: t.restartPolicy as string | undefined,
    autoRemove: t.autoRemove as boolean | undefined,
    startupDelay: t.startupDelay as number | undefined,

    // Network tab fields
    mgmtIpv4: t.mgmtIpv4 as string | undefined,
    mgmtIpv6: t.mgmtIpv6 as string | undefined,
    networkMode: t.networkMode as string | undefined,
    ports: t.ports as string[] | undefined,
    dnsServers: t.dnsServers as string[] | undefined,
    aliases: t.aliases as string[] | undefined,

    // Advanced tab fields
    cpu: t.cpu as number | undefined,
    cpuSet: t.cpuSet as string | undefined,
    memory: t.memory as string | undefined,
    shmSize: t.shmSize as string | undefined,
    capAdd: t.capAdd as string[] | undefined,
    sysctls: t.sysctls as Record<string, string> | undefined,
    devices: t.devices as string[] | undefined,
    certIssue: t.certIssue as boolean | undefined,
    certKeySize: t.certKeySize as string | undefined,
    certValidity: t.certValidity as string | undefined,
    sans: t.sans as string[] | undefined,
    healthCheck: t.healthCheck as HealthCheckConfig | undefined,
    imagePullPolicy: t.imagePullPolicy as string | undefined,
    runtime: t.runtime as string | undefined,

    // Components tab fields (SROS)
    isDistributed: t.isDistributed as boolean | undefined,
    components: t.components as SrosComponent[] | undefined,
  };
}

/**
 * Create a new empty CustomTemplateEditorData
 */
export function createNewTemplateEditorData(defaultKind = 'nokia_srlinux'): CustomTemplateEditorData {
  return {
    id: 'temp-custom-node',
    isCustomTemplate: true,
    customName: '',
    kind: defaultKind,
    type: '',
    image: '',
    icon: 'pe',
    baseName: '',
    interfacePattern: '',
    isDefaultCustomNode: false
  };
}
