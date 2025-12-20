/**
 * Type definitions for link editor
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * This file re-exports them for backward compatibility with webview imports.
 */

// Re-export core types from shared
export {
  type LinkEditorTabId,
  type LinkEndpoint,
  type LinkEditorData
} from '../../../../shared/types/editors';

// Webview-specific types (React props)
import type { LinkEditorData } from '../../../../shared/types/editors';

/**
 * Props for link editor tab components
 */
export interface LinkTabProps {
  data: LinkEditorData;
  onChange: (updates: Partial<LinkEditorData>) => void;
}
