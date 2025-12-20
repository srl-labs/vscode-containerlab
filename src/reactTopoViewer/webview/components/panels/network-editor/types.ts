/**
 * Network Editor Types
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * This file re-exports them for backward compatibility with webview imports.
 */

// Re-export core types from shared
export {
  type NetworkType,
  type NetworkEditorData,
  NETWORK_TYPES,
  VXLAN_TYPES,
  BRIDGE_TYPES,
  HOST_TYPES,
  MACVLAN_MODES,
  getInterfaceLabel,
  getInterfacePlaceholder,
  showInterfaceField,
  supportsExtendedProps
} from '../../../../shared/types/editors';
