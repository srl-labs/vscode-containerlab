/**
 * Conversions for link editor data.
 */
import type { LinkEditorData } from '../components/panels/link-editor/types';
import { isSpecialEndpointId } from '../../shared/utilities/LinkTypes';

/**
 * Converts raw Cytoscape edge data to LinkEditorData.
 */
export function convertToLinkEditorData(rawData: Record<string, unknown> | null): LinkEditorData | null {
  if (!rawData) return null;
  const source = (rawData.source as string) || '';
  const target = (rawData.target as string) || '';
  const sourceEndpoint = (rawData.sourceEndpoint as string) || '';
  const targetEndpoint = (rawData.targetEndpoint as string) || '';

  return {
    id: (rawData.id as string) || '',
    source,
    target,
    sourceEndpoint,
    targetEndpoint,
    type: (rawData.linkType as string) || 'veth',
    sourceMac: ((rawData.endpointA as Record<string, unknown>)?.mac as string) || '',
    targetMac: ((rawData.endpointB as Record<string, unknown>)?.mac as string) || '',
    mtu: rawData.mtu as number | undefined,
    vars: (rawData.vars as Record<string, string>) || {},
    labels: (rawData.labels as Record<string, string>) || {},
    originalSource: source,
    originalTarget: target,
    originalSourceEndpoint: sourceEndpoint,
    originalTargetEndpoint: targetEndpoint,
    sourceIsNetwork: isSpecialEndpointId(source),
    targetIsNetwork: isSpecialEndpointId(target)
  };
}

