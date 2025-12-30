import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';

type ModifierKey = 'alt' | 'shift';

const ANNOTATION_ROLES = new Set(['freeText', 'freeShape', 'group']);

export function getModifierTapTarget<T extends NodeSingular | EdgeSingular>(
  evt: EventObject,
  cy: Core,
  options: { mode: 'edit' | 'view'; isLocked: boolean; modifier: ModifierKey }
): T | null {
  if (options.mode !== 'edit' || options.isLocked) return null;

  const originalEvent = evt.originalEvent as MouseEvent | undefined;
  if (!originalEvent) return null;

  if (options.modifier === 'alt' && !originalEvent.altKey) return null;
  if (options.modifier === 'shift' && !originalEvent.shiftKey) return null;

  const target = evt.target as Core | T;
  if (target === cy) return null;

  const role = (target as T).data('topoViewerRole') as string | undefined;
  if (role && ANNOTATION_ROLES.has(role)) return null;

  return target as T;
}
