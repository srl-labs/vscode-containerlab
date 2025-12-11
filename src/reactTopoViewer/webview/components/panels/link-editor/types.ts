/**
 * Type definitions for link editor
 */

export type LinkEditorTabId = 'basic' | 'extended';

/**
 * Link endpoint data structure
 */
export interface LinkEndpoint {
  node: string;
  interface: string;
  mac?: string;
}

/**
 * Link editor data structure
 */
export interface LinkEditorData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
  type?: 'veth' | 'host' | 'mgmt-net' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | string;
  // Extended properties
  sourceMac?: string;
  targetMac?: string;
  mtu?: number | string;
  vars?: Record<string, string>;
  labels?: Record<string, string>;
  // Original values for finding the link when endpoints change
  originalSource?: string;
  originalTarget?: string;
  originalSourceEndpoint?: string;
  originalTargetEndpoint?: string;
}

/**
 * Props for link editor tab components
 */
export interface LinkTabProps {
  data: LinkEditorData;
  onChange: (updates: Partial<LinkEditorData>) => void;
}
