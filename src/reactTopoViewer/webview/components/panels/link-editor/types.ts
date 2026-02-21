/**
 * Type definitions for link editor
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * Types are exported via the index.ts file for backward compatibility.
 */

import type {
  LinkEditorTabId as _LinkEditorTabId,
  LinkEndpoint as _LinkEndpoint,
  LinkEditorData as _LinkEditorData,
} from "../../../../shared/types/editors";

// Re-export types (import then export pattern for non-index files)
export type LinkEditorTabId = _LinkEditorTabId;
export type LinkEndpoint = _LinkEndpoint;
export type LinkEditorData = _LinkEditorData;

/**
 * Props for link editor tab components
 */
export interface LinkTabProps {
  data: LinkEditorData;
  onChange: (updates: Partial<LinkEditorData>) => void;
  /** Live-preview offset changes on the canvas */
  onPreviewOffset?: (data: LinkEditorData) => void;
}
