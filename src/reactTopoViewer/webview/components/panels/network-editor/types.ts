/**
 * Network Editor Types
 *
 * NOTE: Core types are now defined in shared/types/editors.ts
 * Types are exported via the index.ts file for backward compatibility.
 */

import type {
  NetworkType as _NetworkType,
  NetworkEditorData as _NetworkEditorData,
} from "../../../../shared/types/editors";
import {
  NETWORK_TYPES as _NETWORK_TYPES,
  VXLAN_TYPES as _VXLAN_TYPES,
  BRIDGE_TYPES as _BRIDGE_TYPES,
  HOST_TYPES as _HOST_TYPES,
  MACVLAN_MODES as _MACVLAN_MODES,
  getInterfaceLabel as _getInterfaceLabel,
  getInterfacePlaceholder as _getInterfacePlaceholder,
  showInterfaceField as _showInterfaceField,
  supportsExtendedProps as _supportsExtendedProps,
} from "../../../../shared/types/editors";

// Re-export types
export type NetworkType = _NetworkType;
export type NetworkEditorData = _NetworkEditorData;

// Re-export values
export const NETWORK_TYPES = _NETWORK_TYPES;
export const VXLAN_TYPES = _VXLAN_TYPES;
export const BRIDGE_TYPES = _BRIDGE_TYPES;
export const HOST_TYPES = _HOST_TYPES;
export const MACVLAN_MODES = _MACVLAN_MODES;
export const getInterfaceLabel = _getInterfaceLabel;
export const getInterfacePlaceholder = _getInterfacePlaceholder;
export const showInterfaceField = _showInterfaceField;
export const supportsExtendedProps = _supportsExtendedProps;
