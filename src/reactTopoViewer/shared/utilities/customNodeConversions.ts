/**
 * Utility functions for converting between CustomTemplateEditorData and NodeEditorData/SaveCustomNodeData
 */

import type { NodeEditorData, CustomTemplateEditorData, CustomNodeTemplate } from '../types/editors';

/**
 * Data format for saving custom node to extension
 */
export interface SaveCustomNodeData {
  name: string;
  oldName?: string;
  kind: string;
  type?: string;
  image?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  baseName?: string;
  interfacePattern?: string;
  setDefault?: boolean;
  [key: string]: unknown;
}

/**
 * Convert CustomTemplateEditorData to NodeEditorData for the node editor panel
 */
export function convertCustomTemplateToEditorData(template: CustomTemplateEditorData): NodeEditorData {
  return {
    id: template.id,
    name: '', // Not used for custom templates
    isCustomTemplate: true,
    customName: template.customName,
    kind: template.kind,
    type: template.type,
    image: template.image,
    icon: template.icon,
    iconColor: template.iconColor,
    iconCornerRadius: template.iconCornerRadius,
    baseName: template.baseName,
    interfacePattern: template.interfacePattern,
    isDefaultCustomNode: template.isDefaultCustomNode
  };
}

/**
 * Convert NodeEditorData back to SaveCustomNodeData format for extension
 */
export function convertEditorDataToSaveData(
  data: NodeEditorData,
  originalName?: string
): SaveCustomNodeData {
  return {
    name: data.customName || '',
    oldName: originalName,
    kind: data.kind || '',
    type: data.type,
    image: data.image,
    icon: data.icon,
    iconColor: data.iconColor,
    iconCornerRadius: data.iconCornerRadius,
    baseName: data.baseName,
    interfacePattern: data.interfacePattern,
    setDefault: data.isDefaultCustomNode
  };
}

/**
 * Convert CustomNodeTemplate to CustomTemplateEditorData for editing
 */
export function convertTemplateToEditorData(template: CustomNodeTemplate): CustomTemplateEditorData {
  return {
    id: 'edit-custom-node',
    isCustomTemplate: true,
    customName: template.name,
    kind: template.kind,
    type: template.type,
    image: template.image,
    icon: template.icon,
    iconColor: (template as Record<string, unknown>).iconColor as string | undefined,
    iconCornerRadius: (template as Record<string, unknown>).iconCornerRadius as number | undefined,
    baseName: template.baseName,
    interfacePattern: template.interfacePattern,
    isDefaultCustomNode: template.setDefault,
    originalName: template.name
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
