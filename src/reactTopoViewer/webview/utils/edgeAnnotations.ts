import type { CyElement, EdgeAnnotation } from "../../shared/types/topology";

import { DEFAULT_ENDPOINT_LABEL_OFFSET, parseEndpointLabelOffset } from "./endpointLabelOffset";

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

export type EdgeOffsetUpdateInput = EdgeIdentity & {
  endpointLabelOffsetEnabled?: boolean;
  endpointLabelOffset?: number;
};

function buildEdgeKey(identity: EdgeIdentity): string | null {
  if (!identity.source || !identity.target) return null;
  const sourceEndpoint = identity.sourceEndpoint ?? "";
  const targetEndpoint = identity.targetEndpoint ?? "";
  return `${identity.source}|${sourceEndpoint}|${identity.target}|${targetEndpoint}`;
}

function getEdgeIdentityFromElement(element: CyElement): EdgeIdentity | null {
  if (element.group !== "edges") return null;
  const data = element.data as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : undefined;
  const source = typeof data.source === "string" ? data.source : undefined;
  const target = typeof data.target === "string" ? data.target : undefined;
  const sourceEndpoint = typeof data.sourceEndpoint === "string" ? data.sourceEndpoint : undefined;
  const targetEndpoint = typeof data.targetEndpoint === "string" ? data.targetEndpoint : undefined;
  if (!id && !source && !target) return null;
  return { id, source, target, sourceEndpoint, targetEndpoint };
}

export function buildEdgeAnnotationLookup(
  annotations: EdgeAnnotation[] | undefined
): EdgeAnnotationLookup {
  const byId = new Map<string, EdgeAnnotation>();
  const byKey = new Map<string, EdgeAnnotation>();

  (annotations ?? []).forEach((annotation) => {
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

export function pruneEdgeAnnotations(
  annotations: EdgeAnnotation[] | undefined,
  elements: CyElement[] | undefined
): EdgeAnnotation[] {
  if (!annotations || annotations.length === 0) return [];
  if (!elements) return annotations;
  const edgeKeys = new Set<string>();
  const edgeIds = new Set<string>();

  elements.forEach((element) => {
    const identity = getEdgeIdentityFromElement(element);
    if (!identity) return;
    if (identity.id) edgeIds.add(identity.id);
    const key = buildEdgeKey(identity);
    if (key) edgeKeys.add(key);
  });

  return annotations.filter((annotation) => {
    const key = buildEdgeKey(annotation);
    if (key) return edgeKeys.has(key);
    if (!annotation.id) return false;
    return edgeIds.has(annotation.id);
  });
}

export function findEdgeAnnotation(
  annotations: EdgeAnnotation[] | undefined,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  if (!annotations || annotations.length === 0) return undefined;
  const key = buildEdgeKey(identity);
  if (key) {
    const byKey = annotations.find((annotation) => buildEdgeKey(annotation) === key);
    if (byKey) return byKey;
    if (identity.id) {
      const byId = annotations.find((annotation) => annotation.id === identity.id);
      if (!byId) return undefined;
      const byIdKey = buildEdgeKey(byId);
      return byIdKey && byIdKey === key ? byId : undefined;
    }
    return undefined;
  }
  if (!identity.id) return undefined;
  return annotations.find((annotation) => annotation.id === identity.id);
}

export function findEdgeAnnotationInLookup(
  lookup: EdgeAnnotationLookup,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  const key = buildEdgeKey(identity);
  if (key) {
    const byKey = lookup.byKey.get(key);
    if (byKey) return byKey;
    if (identity.id) {
      const byId = lookup.byId.get(identity.id);
      if (!byId) return undefined;
      const byIdKey = buildEdgeKey(byId);
      return byIdKey && byIdKey === key ? byId : undefined;
    }
    return undefined;
  }
  if (!identity.id) return undefined;
  return lookup.byId.get(identity.id);
}

export function upsertEdgeAnnotation(
  annotations: EdgeAnnotation[],
  next: EdgeAnnotation
): EdgeAnnotation[] {
  const nextId = next.id;
  const nextKey = buildEdgeKey(next);
  let updated = false;

  const updatedList = annotations.map((existing) => {
    const existingKey = buildEdgeKey(existing);
    const keyMatches = nextKey !== null && existingKey === nextKey;
    const idMatches = nextId !== undefined && existing.id === nextId;
    const shouldUpdateById = idMatches && (nextKey === null || existingKey === nextKey);

    if (keyMatches || shouldUpdateById) {
      updated = true;
      return { ...existing, ...next };
    }
    return existing;
  });

  if (updated) return updatedList;
  return [...annotations, next];
}

export function upsertEdgeLabelOffsetAnnotation(
  annotations: EdgeAnnotation[],
  data: EdgeOffsetUpdateInput
): EdgeAnnotation[] | null {
  const existing = findEdgeAnnotation(annotations, data);
  const shouldPersist = data.endpointLabelOffsetEnabled === true || existing !== undefined;
  if (!shouldPersist) return null;

  const fallbackOffset =
    parseEndpointLabelOffset(existing?.endpointLabelOffset) ?? DEFAULT_ENDPOINT_LABEL_OFFSET;
  const offset = parseEndpointLabelOffset(data.endpointLabelOffset) ?? fallbackOffset;

  const nextAnnotation: EdgeAnnotation = {
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint: data.sourceEndpoint,
    targetEndpoint: data.targetEndpoint,
    endpointLabelOffsetEnabled: data.endpointLabelOffsetEnabled === true,
    endpointLabelOffset: offset
  };

  return upsertEdgeAnnotation(annotations, nextAnnotation);
}
