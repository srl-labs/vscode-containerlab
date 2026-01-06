/**
 * Conversions for link editor data.
 */
import type { LinkEditorData } from '../components/panels/link-editor/types';
import type { LinkSaveData } from '../../shared/io/LinkPersistenceIO';
import { isSpecialEndpointId } from '../../shared/utilities/LinkTypes';

/** Parse MTU from raw value (can be string or number) */
function parseMtu(raw: unknown): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Get string value from object with fallback */
function getStr(obj: Record<string, unknown>, key: string, fallback = ''): string {
  return (obj[key] as string) || fallback;
}

/** Get MAC address from extended data or legacy endpoint object */
function getMac(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  endpointKey: string
): string {
  const extVal = extraData[extKey] as string | undefined;
  if (extVal) return extVal;
  const endpoint = rawData[endpointKey] as Record<string, unknown> | undefined;
  return (endpoint?.mac as string) || '';
}

/** Get key-value map from extended data or raw data */
function getMap(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  rawKey: string
): Record<string, string> {
  return (extraData[extKey] as Record<string, string>) ||
         (rawData[rawKey] as Record<string, string>) || {};
}

/**
 * Converts raw Cytoscape edge data to LinkEditorData.
 */
export function convertToLinkEditorData(rawData: Record<string, unknown> | null): LinkEditorData | null {
  if (!rawData) return null;

  const source = getStr(rawData, 'source');
  const target = getStr(rawData, 'target');
  const sourceEndpoint = getStr(rawData, 'sourceEndpoint');
  const targetEndpoint = getStr(rawData, 'targetEndpoint');
  const extraData = (rawData.extraData as Record<string, unknown>) || {};

  return {
    id: getStr(rawData, 'id'),
    source,
    target,
    sourceEndpoint,
    targetEndpoint,
    type: getStr(extraData, 'extType') || getStr(rawData, 'linkType', 'veth'),
    sourceMac: getMac(extraData, 'extSourceMac', rawData, 'endpointA'),
    targetMac: getMac(extraData, 'extTargetMac', rawData, 'endpointB'),
    mtu: parseMtu(extraData.extMtu),
    vars: getMap(extraData, 'extVars', rawData, 'vars'),
    labels: getMap(extraData, 'extLabels', rawData, 'labels'),
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

