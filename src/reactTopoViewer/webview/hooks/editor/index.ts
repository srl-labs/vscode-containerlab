/**
 * Editor hooks (panels + editor data)
 */

// Panel state
export { useLabSettingsState } from "./useLabSettings";
export type { UseLabSettingsStateResult } from "./useLabSettings";

// Editor handlers
export {
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  useNodeCreationHandlers,
} from "./useEditorHandlers";
export type { NodeCreationState } from "./useEditorHandlers";

// Generic form utilities
export { useGenericFormState, useEditorHandlers } from "./useGenericFormState";
export { useEditorHandlersWithFooterRef } from "./useEditorHandlersWithFooterRef";

// Custom node template editor
export { useCustomTemplateEditor } from "./useCustomTemplateEditor";
export type {
  CustomTemplateEditorHandlers,
  CustomTemplateEditorResult,
} from "./useCustomTemplateEditor";

// Editor form hooks (extracted from view components)
export { useNodeEditorForm, hasFieldChanged, YAML_TO_EDITOR_MAP } from "./useNodeEditorForm";
export type { UseNodeEditorFormReturn } from "./useNodeEditorForm";
export { useLinkEditorForm } from "./useLinkEditorForm";
export type { UseLinkEditorFormReturn } from "./useLinkEditorForm";
export { useNetworkEditorForm } from "./useNetworkEditorForm";
export type { UseNetworkEditorFormReturn } from "./useNetworkEditorForm";
export { useLinkImpairmentForm } from "./useLinkImpairmentForm";
export type { UseLinkImpairmentFormReturn } from "./useLinkImpairmentForm";

// Editor data helpers
export { useSchema } from "./useSchema";
export type { SrosComponentTypes } from "./useSchema";
export { useDockerImages } from "./useDockerImages";
