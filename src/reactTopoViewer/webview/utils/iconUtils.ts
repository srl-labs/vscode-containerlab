import type { CustomIconInfo } from "../../shared/types/icons";

const customIconMapCache = new WeakMap<CustomIconInfo[], Map<string, string>>();

export function buildCustomIconMap(customIcons: CustomIconInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const icon of customIcons) {
    map.set(icon.name, icon.dataUri);
  }
  return map;
}

export function getCustomIconMap(customIcons: CustomIconInfo[]): Map<string, string> {
  const cached = customIconMapCache.get(customIcons);
  if (cached) return cached;
  const map = buildCustomIconMap(customIcons);
  customIconMapCache.set(customIcons, map);
  return map;
}
