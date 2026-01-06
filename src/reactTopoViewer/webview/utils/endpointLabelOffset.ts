export const DEFAULT_ENDPOINT_LABEL_OFFSET = 20;
export const ENDPOINT_LABEL_OFFSET_MIN = 0;
export const ENDPOINT_LABEL_OFFSET_MAX = 60;

export function clampEndpointLabelOffset(value: number): number {
  return Math.min(ENDPOINT_LABEL_OFFSET_MAX, Math.max(ENDPOINT_LABEL_OFFSET_MIN, value));
}

export function parseEndpointLabelOffset(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampEndpointLabelOffset(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return clampEndpointLabelOffset(parsed);
    }
  }
  return null;
}
