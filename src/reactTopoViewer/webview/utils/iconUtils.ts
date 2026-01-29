import type { CustomIconInfo } from "../../shared/types/icons";

export function buildCustomIconMap(customIcons: CustomIconInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const icon of customIcons) {
    map.set(icon.name, icon.dataUri);
  }
  return map;
}
