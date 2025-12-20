/**
 * Type definitions for node editor
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * Types are exported via the index.ts file for backward compatibility.
 */

import type {
  NodeEditorTabId as _NodeEditorTabId,
  HealthCheckConfig as _HealthCheckConfig,
  SrosMda as _SrosMda,
  SrosXiom as _SrosXiom,
  SrosComponent as _SrosComponent,
  NodeEditorData as _NodeEditorData
} from '../../../../shared/types/editors';

import { INTEGRATED_SROS_TYPES as _INTEGRATED_SROS_TYPES } from '../../../../shared/types/editors';

// Re-export types
export type NodeEditorTabId = _NodeEditorTabId;
export type HealthCheckConfig = _HealthCheckConfig;
export type SrosMda = _SrosMda;
export type SrosXiom = _SrosXiom;
export type SrosComponent = _SrosComponent;
export type NodeEditorData = _NodeEditorData;

// Re-export values
export const INTEGRATED_SROS_TYPES = _INTEGRATED_SROS_TYPES;

/**
 * Props for tab components
 */
export interface TabProps {
  data: NodeEditorData;
  onChange: (updates: Partial<NodeEditorData>) => void;
  /** Array of property names that are inherited from defaults/kinds/groups */
  inheritedProps?: string[];
}
