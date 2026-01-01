import type { EdgeAnnotation } from '../../shared/types/topology';

export type EdgeIdentity = {
  id?: string;
  source?: string;
  target?: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
};

export type EdgeAnnotationLookup = {
  byId: Map<string, EdgeAnnotation>;
  byKey: Map<string, EdgeAnnotation>;
};

function buildEdgeKey(identity: EdgeIdentity): string | null {
  if (!identity.source || !identity.target) return null;
  const sourceEndpoint = identity.sourceEndpoint ?? '';
  const targetEndpoint = identity.targetEndpoint ?? '';
  return `${identity.source}|${sourceEndpoint}|${identity.target}|${targetEndpoint}`;
}

export function buildEdgeAnnotationLookup(annotations: EdgeAnnotation[] | undefined): EdgeAnnotationLookup {
  const byId = new Map<string, EdgeAnnotation>();
  const byKey = new Map<string, EdgeAnnotation>();

  (annotations ?? []).forEach(annotation => {
    if (annotation.id) {
      byId.set(annotation.id, annotation);
    }
    const key = buildEdgeKey(annotation);
    if (key) {
      byKey.set(key, annotation);
    }
  });

  return { byId, byKey };
}

export function findEdgeAnnotation(
  annotations: EdgeAnnotation[] | undefined,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  if (!annotations || annotations.length === 0) return undefined;
  if (identity.id) {
    const byId = annotations.find(annotation => annotation.id === identity.id);
    if (byId) return byId;
  }
  const key = buildEdgeKey(identity);
  if (!key) return undefined;
  return annotations.find(annotation => buildEdgeKey(annotation) === key);
}

export function findEdgeAnnotationInLookup(
  lookup: EdgeAnnotationLookup,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  if (identity.id) {
    const byId = lookup.byId.get(identity.id);
    if (byId) return byId;
  }
  const key = buildEdgeKey(identity);
  if (!key) return undefined;
  return lookup.byKey.get(key);
}

export function upsertEdgeAnnotation(
  annotations: EdgeAnnotation[],
  next: EdgeAnnotation
): EdgeAnnotation[] {
  const nextId = next.id;
  const nextKey = buildEdgeKey(next);
  let updated = false;

  const updatedList = annotations.map(existing => {
    if (nextId && existing.id === nextId) {
      updated = true;
      return { ...existing, ...next };
    }
    if (nextKey) {
      const existingKey = buildEdgeKey(existing);
      if (existingKey && existingKey === nextKey) {
        updated = true;
        return { ...existing, ...next };
      }
    }
    return existing;
  });

  if (updated) return updatedList;
  return [...annotations, next];
}
