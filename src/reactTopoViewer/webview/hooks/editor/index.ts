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
  useNodeCreationHandlers
} from "./useEditorHandlers";
export type { NodeCreationState } from "./useEditorHandlers";

// Generic form utilities
export { useGenericFormState, useEditorHandlers } from "./useGenericFormState";

// Custom node template editor
export { useCustomTemplateEditor } from "./useCustomTemplateEditor";
export type {
  CustomTemplateEditorHandlers,
  CustomTemplateEditorResult
} from "./useCustomTemplateEditor";

// Editor data helpers
export { useSchema } from "./useSchema";
export type { SrosComponentTypes } from "./useSchema";
export { useDockerImages } from "./useDockerImages";
