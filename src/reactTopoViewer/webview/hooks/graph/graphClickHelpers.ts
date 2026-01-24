import type {
  CyCompatCore,
  CyCompatEventObject,
  CyCompatNodeElement,
  CyCompatEdgeElement
} from "../useCytoCompatInstance";

type ModifierKey = "alt" | "shift";

const ANNOTATION_ROLES = new Set(["freeText", "freeShape", "group"]);

export function getModifierTapTarget<T extends CyCompatNodeElement | CyCompatEdgeElement>(
  evt: CyCompatEventObject,
  cyCompat: CyCompatCore,
  options: { mode: "edit" | "view"; isLocked: boolean; modifier: ModifierKey }
): T | null {
  if (options.mode !== "edit" || options.isLocked) return null;

  const originalEvent = evt.originalEvent as MouseEvent | undefined;
  if (!originalEvent) return null;

  if (options.modifier === "alt" && !originalEvent.altKey) return null;
  if (options.modifier === "shift" && !originalEvent.shiftKey) return null;

  const target = evt.target;
  // Check if target is the core instance (canvas click, not element click)
  if (target === cyCompat) return null;

  const role = (target as T).data("topoViewerRole") as string | undefined;
  if (role && ANNOTATION_ROLES.has(role)) return null;

  return target as T;
}
