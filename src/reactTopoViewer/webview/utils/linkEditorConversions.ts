/**
 * Conversions for link editor data.
 */
import type { LinkEditorData } from '../components/panels/link-editor/types';
import type { LinkSaveData } from '../../shared/io/LinkPersistenceIO';
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

/**
 * Converts LinkEditorData to LinkSaveData for TopologyIO.
 * This is used when saving link editor changes via the services.
 *
 * @param data - LinkEditorData from the editor panel
 * @returns LinkSaveData for TopologyIO.editLink()
 */
export function convertEditorDataToLinkSaveData(data: LinkEditorData): LinkSaveData {
  // Build extraData with extended properties
  const extraData: LinkSaveData['extraData'] = {};

  if (data.type && data.type !== 'veth') {
    extraData.extType = data.type;
  }
  if (data.mtu !== undefined && data.mtu !== '') {
    extraData.extMtu = data.mtu;
  }
  if (data.sourceMac) {
    extraData.extSourceMac = data.sourceMac;
  }
  if (data.targetMac) {
    extraData.extTargetMac = data.targetMac;
  }
  if (data.vars && Object.keys(data.vars).length > 0) {
    extraData.extVars = data.vars;
  }
  if (data.labels && Object.keys(data.labels).length > 0) {
    extraData.extLabels = data.labels;
  }

  const saveData: LinkSaveData = {
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint: data.sourceEndpoint,
    targetEndpoint: data.targetEndpoint,
    extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
    // Include original values if endpoints changed
    originalSource: data.originalSource,
    originalTarget: data.originalTarget,
    originalSourceEndpoint: data.originalSourceEndpoint,
    originalTargetEndpoint: data.originalTargetEndpoint,
  };

  return saveData;
}

