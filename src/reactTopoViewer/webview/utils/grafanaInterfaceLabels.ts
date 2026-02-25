export const DEFAULT_GRAFANA_NODE_SIZE_PX = 40;
export const DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT = 100;

export const INTERFACE_SELECT_AUTO = "__auto__";
export const INTERFACE_SELECT_FULL = "__full__";
export const INTERFACE_SELECT_TOKEN_PREFIX = "__token__:";
export const GLOBAL_INTERFACE_PART_INDEX_PREFIX = "__part-index__:";

export function parseBoundedNumber(
  value: string,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function clampGrafanaNodeSizePx(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRAFANA_NODE_SIZE_PX;
  return Math.max(12, Math.min(240, value));
}

export function clampGrafanaInterfaceSizePercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRAFANA_INTERFACE_SIZE_PERCENT;
  return Math.max(40, Math.min(400, value));
}

export function splitInterfaceParts(endpoint: string): string[] {
  const baseParts = endpoint
    .split(/[^A-Za-z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const uniqueParts: string[] = [];
  const seen = new Set<string>();
  const addUnique = (part: string): void => {
    if (seen.has(part)) return;
    seen.add(part);
    uniqueParts.push(part);
  };

  for (const part of baseParts) {
    addUnique(part);
    const numericSegments = part.match(/\d+/g);
    if (!numericSegments) continue;
    for (const numeric of numericSegments) {
      addUnique(numeric);
    }
  }

  return uniqueParts;
}

export function getAutoCompactInterfaceLabel(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return "";

  let end = trimmed.length - 1;
  while (end >= 0 && (trimmed[end] < "0" || trimmed[end] > "9")) {
    end -= 1;
  }
  if (end >= 0) {
    let start = end;
    while (start >= 0 && trimmed[start] >= "0" && trimmed[start] <= "9") {
      start -= 1;
    }
    return trimmed.slice(start + 1, end + 1);
  }

  const token =
    trimmed
      .split(/[:/.-]/)
      .filter((part) => part.length > 0)
      .pop() ?? trimmed;
  return token.length <= 3 ? token : token.slice(-3);
}

function parseGlobalInterfacePartIndex(selectedValue: string): number | null {
  if (!selectedValue.startsWith(GLOBAL_INTERFACE_PART_INDEX_PREFIX)) return null;
  const raw = selectedValue.slice(GLOBAL_INTERFACE_PART_INDEX_PREFIX.length);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

export function resolveGlobalInterfaceOverrideValue(
  endpoint: string,
  selectedValue: string
): string | null {
  if (selectedValue === INTERFACE_SELECT_AUTO) return null;
  if (selectedValue === INTERFACE_SELECT_FULL) return endpoint;

  const partIndex = parseGlobalInterfacePartIndex(selectedValue);
  if (partIndex === null) return null;

  const parts = splitInterfaceParts(endpoint);
  return parts[partIndex - 1] ?? null;
}

export function resolveInterfaceOverrideValue(
  endpoint: string,
  selectedValue: string
): string | null {
  if (selectedValue === INTERFACE_SELECT_AUTO) return null;
  if (selectedValue === INTERFACE_SELECT_FULL) return endpoint;
  if (selectedValue.startsWith(INTERFACE_SELECT_TOKEN_PREFIX)) {
    const token = selectedValue.slice(INTERFACE_SELECT_TOKEN_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

export function getInterfaceSelectionValue(
  endpoint: string,
  interfaceLabelOverrides: Record<string, string>
): string {
  if (!(endpoint in interfaceLabelOverrides)) return INTERFACE_SELECT_AUTO;
  const override = interfaceLabelOverrides[endpoint];
  if (override.length === 0) return INTERFACE_SELECT_AUTO;
  if (override === endpoint) return INTERFACE_SELECT_FULL;
  return `${INTERFACE_SELECT_TOKEN_PREFIX}${override}`;
}

export function resolveGrafanaInterfaceLabel(
  endpoint: string,
  globalSelection: string,
  interfaceLabelOverrides: Record<string, string>
): string {
  const endpointOverride = interfaceLabelOverrides[endpoint];
  if (typeof endpointOverride === "string" && endpointOverride.trim().length > 0) {
    return endpointOverride.trim();
  }

  const globalOverride = resolveGlobalInterfaceOverrideValue(endpoint, globalSelection);
  if (globalOverride !== null) return globalOverride;

  return getAutoCompactInterfaceLabel(endpoint);
}
