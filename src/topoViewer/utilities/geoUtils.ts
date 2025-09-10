export interface LatLngDataItem {
  data: {
    id?: string;
    lat?: string;
    lng?: string;
    [key: string]: any;
  };
}

function addIfValidNumber(target: number[], maybe?: string) {
  if (!maybe) return;
  const s = maybe.trim();
  if (!s) return;
  const n = parseFloat(s);
  if (!isNaN(n)) target.push(n);
}

function computeAverage(values: number[], fallback: number): { avg: number; usedDefault: boolean } {
  if (values.length === 0) return { avg: fallback, usedDefault: true };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg, usedDefault: false };
}

function normalizeCoord(
  value: string | undefined,
  average: number,
  defaultAverage: number,
  counter: { value: number },
  usedDefault: boolean,
): string {
  const normalized = value && value.trim() !== '' ? parseFloat(value) : NaN;
  if (!isNaN(normalized)) {
    return normalized.toFixed(15);
  }
  const deterministicOffset = (counter.value++ % 9) * 0.1;
  const base = usedDefault ? defaultAverage : (average + deterministicOffset);
  return base.toFixed(15);
}

export function assignMissingLatLngToElements<T extends LatLngDataItem>(dataArray: T[]): T[] {
  const DEFAULT_AVERAGE_LAT = 48.684826888402256;
  const DEFAULT_AVERAGE_LNG = 9.007895390625677;
  const existingLats: number[] = [];
  const existingLngs: number[] = [];

  dataArray.forEach(({ data }) => {
    addIfValidNumber(existingLats, data.lat);
    addIfValidNumber(existingLngs, data.lng);
  });

  const { avg: averageLat, usedDefault: usedDefaultLat } = computeAverage(existingLats, DEFAULT_AVERAGE_LAT);
  const { avg: averageLng, usedDefault: usedDefaultLng } = computeAverage(existingLngs, DEFAULT_AVERAGE_LNG);

  const counter = { value: 0 };
  dataArray.forEach(item => {
    const { data } = item;
    data.lat = normalizeCoord(data.lat, averageLat, DEFAULT_AVERAGE_LAT, counter, usedDefaultLat);
    data.lng = normalizeCoord(data.lng, averageLng, DEFAULT_AVERAGE_LNG, counter, usedDefaultLng);
  });

  return dataArray;
}

export function assignMissingLatLngToCy(cy: any): void {
  if (!cy) return;
  const stats = computeLatLngStats(cy);
  cy.nodes().forEach((node: any) => applyLatLng(node, stats));
}

function computeLatLngStats(cy: any) {
  const DEFAULT_AVERAGE_LAT = 48.684826888402256;
  const DEFAULT_AVERAGE_LNG = 9.007895390625677;

  const lats: number[] = [];
  const lngs: number[] = [];
  cy.nodes().forEach((node: any) => {
    const lat = parseFloat(node.data('lat'));
    if (!isNaN(lat)) lats.push(lat);
    const lng = parseFloat(node.data('lng'));
    if (!isNaN(lng)) lngs.push(lng);
  });

  const avgLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : DEFAULT_AVERAGE_LAT;
  const avgLng = lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : DEFAULT_AVERAGE_LNG;
  return {
    avgLat,
    avgLng,
    useDefaultLat: lats.length === 0,
    useDefaultLng: lngs.length === 0,
    DEFAULT_AVERAGE_LAT,
    DEFAULT_AVERAGE_LNG
  };
}

function applyLatLng(node: any, stats: ReturnType<typeof computeLatLngStats>) {
  const { avgLat, avgLng, useDefaultLat, useDefaultLng, DEFAULT_AVERAGE_LAT, DEFAULT_AVERAGE_LNG } = stats;

  let lat = parseFloat(node.data('lat'));
  if (!node.data('lat') || isNaN(lat)) {
    const idx = node.id().length % 5;
    const offset = (idx - 2) * 0.05;
    lat = (useDefaultLat ? DEFAULT_AVERAGE_LAT : avgLat) + offset;
  }

  let lng = parseFloat(node.data('lng'));
  if (!node.data('lng') || isNaN(lng)) {
    const idx = (node.id().charCodeAt(0) || 0) % 7;
    const offset = (idx - 3) * 0.05;
    lng = (useDefaultLng ? DEFAULT_AVERAGE_LNG : avgLng) + offset;
  }

  node.data('lat', lat.toFixed(15));
  node.data('lng', lng.toFixed(15));
}
