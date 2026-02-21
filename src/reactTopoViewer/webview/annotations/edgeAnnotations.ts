import type { EdgeAnnotation } from "../../shared/types/topology";
import type { TopoEdge } from "../../shared/types/graph";

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

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function buildEdgeKey(identity: EdgeIdentity): string | null {
  if (!hasNonEmptyString(identity.source) || !hasNonEmptyString(identity.target)) return null;
  const sourceEndpoint = identity.sourceEndpoint ?? "";
  const targetEndpoint = identity.targetEndpoint ?? "";
  return `${identity.source}|${sourceEndpoint}|${identity.target}|${targetEndpoint}`;
}

/**
 * Extract edge identity from a ReactFlow edge
 */
function getEdgeIdentityFromEdge(edge: TopoEdge): EdgeIdentity | null {
  const data = edge.data as Record<string, unknown> | undefined;
  const sourceEndpoint = typeof data?.sourceEndpoint === "string" ? data.sourceEndpoint : undefined;
  const targetEndpoint = typeof data?.targetEndpoint === "string" ? data.targetEndpoint : undefined;
  if (!edge.id && !edge.source && !edge.target) return null;
  return { id: edge.id, source: edge.source, target: edge.target, sourceEndpoint, targetEndpoint };
}

export function buildEdgeAnnotationLookup(
  annotations: EdgeAnnotation[] | undefined
): EdgeAnnotationLookup {
  const byId = new Map<string, EdgeAnnotation>();
  const byKey = new Map<string, EdgeAnnotation>();

  (annotations ?? []).forEach((annotation) => {
    if (hasNonEmptyString(annotation.id)) {
      byId.set(annotation.id, annotation);
    }
    const key = buildEdgeKey(annotation);
    if (key !== null) {
      byKey.set(key, annotation);
    }
  });

  return { byId, byKey };
}

export function pruneEdgeAnnotations(
  annotations: EdgeAnnotation[] | undefined,
  edges: TopoEdge[] | undefined
): EdgeAnnotation[] {
  if (!annotations || annotations.length === 0) return [];
  if (!edges) return annotations;
  const edgeKeys = new Set<string>();
  const edgeIds = new Set<string>();

  edges.forEach((edge) => {
    const identity = getEdgeIdentityFromEdge(edge);
    if (!identity) return;
    if (hasNonEmptyString(identity.id)) edgeIds.add(identity.id);
    const key = buildEdgeKey(identity);
    if (key !== null) edgeKeys.add(key);
  });

  return annotations.filter((annotation) => {
    const key = buildEdgeKey(annotation);
    if (key !== null) return edgeKeys.has(key);
    if (!hasNonEmptyString(annotation.id)) return false;
    return edgeIds.has(annotation.id);
  });
}

export function findEdgeAnnotation(
  annotations: EdgeAnnotation[] | undefined,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  if (!annotations || annotations.length === 0) return undefined;
  const key = buildEdgeKey(identity);
  if (key !== null) {
    const byKey = annotations.find((annotation) => buildEdgeKey(annotation) === key);
    if (byKey) return byKey;
    if (hasNonEmptyString(identity.id)) {
      const byId = annotations.find((annotation) => annotation.id === identity.id);
      if (!byId) return undefined;
      const byIdKey = buildEdgeKey(byId);
      return byIdKey !== null && byIdKey === key ? byId : undefined;
    }
    return undefined;
  }
  if (!hasNonEmptyString(identity.id)) return undefined;
  return annotations.find((annotation) => annotation.id === identity.id);
}

export function findEdgeAnnotationInLookup(
  lookup: EdgeAnnotationLookup,
  identity: EdgeIdentity
): EdgeAnnotation | undefined {
  const key = buildEdgeKey(identity);
  if (key !== null) {
    const byKey = lookup.byKey.get(key);
    if (byKey) return byKey;
    if (hasNonEmptyString(identity.id)) {
      const byId = lookup.byId.get(identity.id);
      if (!byId) return undefined;
      const byIdKey = buildEdgeKey(byId);
      return byIdKey !== null && byIdKey === key ? byId : undefined;
    }
    return undefined;
  }
  if (!hasNonEmptyString(identity.id)) return undefined;
  return lookup.byId.get(identity.id);
}

export function upsertEdgeAnnotation(
  annotations: EdgeAnnotation[],
  next: EdgeAnnotation
): EdgeAnnotation[] {
  const nextId = next.id;
  const nextKey = buildEdgeKey(next);
  const matchIndex = annotations.findIndex((existing) => {
    const existingKey = buildEdgeKey(existing);
    const keyMatches = nextKey !== null && existingKey === nextKey;
    const idMatches = nextId !== undefined && existing.id === nextId;
    const shouldUpdateById = idMatches && (nextKey === null || existingKey === nextKey);
    return keyMatches || shouldUpdateById;
  });
  if (matchIndex >= 0) {
    return annotations.map((existing, index) =>
      index === matchIndex ? { ...existing, ...next } : existing
    );
  }
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
    endpointLabelOffset: offset,
  };

  return upsertEdgeAnnotation(annotations, nextAnnotation);
}
