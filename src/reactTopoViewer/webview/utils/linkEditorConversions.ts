/**
 * Conversions for link editor data.
 */
import type { LinkEditorData } from "../../shared/types/editors";
import type { LinkSaveData } from "../../shared/io/LinkPersistenceIO";
import { isSpecialEndpointId } from "../../shared/utilities/LinkTypes";

type LinkExtraData = NonNullable<LinkSaveData["extraData"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse MTU from raw value (can be string or number) */
function parseMtu(raw: unknown): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Get string value from object with fallback */
function getStr(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const value = obj[key];
  return typeof value === "string" ? value : fallback;
}

/** Get MAC address from extended data or legacy endpoint object */
function getEndpointValue(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  endpointKey: string,
  endpointField: string
): string {
  const extVal = extraData[extKey];
  if (typeof extVal === "string" && extVal.length > 0) return extVal;
  const endpoint = rawData[endpointKey];
  if (!isRecord(endpoint)) return "";
  const endpointValue = endpoint[endpointField];
  return typeof endpointValue === "string" ? endpointValue : "";
}

/** Get MAC address from extended data or legacy endpoint object */
function getMac(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  endpointKey: string
): string {
  return getEndpointValue(extraData, extKey, rawData, endpointKey, "mac");
}

/** Get endpoint IP address from extended data or legacy endpoint object */
function getIp(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  endpointKey: string,
  ipVersion: "ipv4" | "ipv6"
): string {
  return getEndpointValue(extraData, extKey, rawData, endpointKey, ipVersion);
}

/** Get key-value map from extended data or raw data */
function getMap(
  extraData: Record<string, unknown>,
  extKey: string,
  rawData: Record<string, unknown>,
  rawKey: string
): Record<string, string> {
  const parse = (value: unknown): Record<string, string> | undefined => {
    if (!isRecord(value)) return undefined;
    const output: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string") {
        output[k] = v;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  };
  return parse(extraData[extKey]) ?? parse(rawData[rawKey]) ?? {};
}

function assignExtraString(
  extraData: LinkExtraData,
  key: keyof LinkExtraData,
  value: string | undefined
): void {
  if (value === undefined || value.length === 0) return;
  extraData[key] = value;
}

function assignExtraMap(
  extraData: LinkExtraData,
  key: "extVars" | "extLabels",
  value: Record<string, string> | undefined
): void {
  if (!value || Object.keys(value).length === 0) return;
  extraData[key] = value;
}

/**
 * Converts raw Edge data to LinkEditorData.
 */
export function convertToLinkEditorData(
  rawData: Record<string, unknown> | null
): LinkEditorData | null {
  if (!rawData) return null;

  const source = getStr(rawData, "source");
  const target = getStr(rawData, "target");
  const sourceEndpoint = getStr(rawData, "sourceEndpoint");
  const targetEndpoint = getStr(rawData, "targetEndpoint");
  const extraData = isRecord(rawData.extraData) ? rawData.extraData : {};
  const yamlSource =
    typeof extraData.yamlSourceNodeId === "string" && extraData.yamlSourceNodeId.length > 0
      ? extraData.yamlSourceNodeId
      : source;
  const yamlTarget =
    typeof extraData.yamlTargetNodeId === "string" && extraData.yamlTargetNodeId.length > 0
      ? extraData.yamlTargetNodeId
      : target;

  return {
    id: getStr(rawData, "id"),
    source,
    target,
    sourceEndpoint,
    targetEndpoint,
    type: getStr(extraData, "extType") || getStr(rawData, "linkType", "veth"),
    sourceMac: getMac(extraData, "extSourceMac", rawData, "endpointA"),
    targetMac: getMac(extraData, "extTargetMac", rawData, "endpointB"),
    sourceIpv4: getIp(extraData, "extSourceIpv4", rawData, "endpointA", "ipv4"),
    sourceIpv6: getIp(extraData, "extSourceIpv6", rawData, "endpointA", "ipv6"),
    targetIpv4: getIp(extraData, "extTargetIpv4", rawData, "endpointB", "ipv4"),
    targetIpv6: getIp(extraData, "extTargetIpv6", rawData, "endpointB", "ipv6"),
    mtu: parseMtu(extraData.extMtu),
    vars: getMap(extraData, "extVars", rawData, "vars"),
    labels: getMap(extraData, "extLabels", rawData, "labels"),
    originalSource: yamlSource,
    originalTarget: yamlTarget,
    originalSourceEndpoint: sourceEndpoint,
    originalTargetEndpoint: targetEndpoint,
    sourceIsNetwork: isSpecialEndpointId(source),
    targetIsNetwork: isSpecialEndpointId(target)
  };
}

/**
 * Converts LinkEditorData to LinkSaveData for host commands.
 * This is used when saving link editor changes via the host pipeline.
 *
 * @param data - LinkEditorData from the editor panel
 * @returns LinkSaveData for host editLink command
 */
export function convertEditorDataToLinkSaveData(data: LinkEditorData): LinkSaveData {
  // Build extraData with extended properties
  const extraData: LinkExtraData = {};

  if (data.type !== undefined && data.type.length > 0 && data.type !== "veth") {
    extraData.extType = data.type;
  }
  if (data.mtu !== undefined && data.mtu !== "") {
    extraData.extMtu = data.mtu;
  }
  assignExtraString(extraData, "extSourceMac", data.sourceMac);
  assignExtraString(extraData, "extTargetMac", data.targetMac);
  assignExtraString(extraData, "extSourceIpv4", data.sourceIpv4);
  assignExtraString(extraData, "extSourceIpv6", data.sourceIpv6);
  assignExtraString(extraData, "extTargetIpv4", data.targetIpv4);
  assignExtraString(extraData, "extTargetIpv6", data.targetIpv6);
  assignExtraMap(extraData, "extVars", data.vars);
  assignExtraMap(extraData, "extLabels", data.labels);

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
    originalTargetEndpoint: data.originalTargetEndpoint
  };

  return saveData;
}
