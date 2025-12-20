/**
 * Type definitions for node editor
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * This file re-exports them for backward compatibility with webview imports.
 */

// Re-export core types from shared
export {
  type NodeEditorTabId,
  INTEGRATED_SROS_TYPES,
  type HealthCheckConfig,
  type SrosMda,
  type SrosXiom,
  type SrosComponent,
  type NodeEditorData
} from '../../../../shared/types/editors';

// Webview-specific types (React props)
import type { NodeEditorData } from '../../../../shared/types/editors';

/**
 * Props for tab components
 */
export interface TabProps {
  data: NodeEditorData;
  onChange: (updates: Partial<NodeEditorData>) => void;
  /** Array of property names that are inherited from defaults/kinds/groups */
  inheritedProps?: string[];
}
