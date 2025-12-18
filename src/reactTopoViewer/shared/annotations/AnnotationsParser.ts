/**
 * Annotations parser for parsing and serializing topology annotations.
 * Pure functions - no VS Code dependencies, no I/O.
 */

import {
  TopologyAnnotations,
  NetworkNodeAnnotation,
} from '../types/topology';
import { createEmptyAnnotations } from './types';

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parses an annotations JSON string.
 * Returns empty annotations if parsing fails.
 */
export function parseAnnotationsJson(json: string): TopologyAnnotations {
  if (!json || json.trim() === '') {
    return createEmptyAnnotations();
  }
  try {
    const parsed = JSON.parse(json) as TopologyAnnotations;
    return migrateAnnotations(parsed);
  } catch {
    return createEmptyAnnotations();
  }
}

/**
 * Parses annotations from an object (already parsed JSON).
 */
export function parseAnnotationsObject(
  obj: Record<string, unknown> | undefined
): TopologyAnnotations {
  if (!obj) return createEmptyAnnotations();
  return migrateAnnotations(obj as TopologyAnnotations);
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serializes annotations to JSON string.
 */
export function serializeAnnotations(
  annotations: TopologyAnnotations,
  pretty = true
): string {
  // Remove legacy cloudNodeAnnotations before saving
  const toSave = { ...annotations };
  // eslint-disable-next-line sonarjs/deprecation
  delete toSave.cloudNodeAnnotations;
  return pretty ? JSON.stringify(toSave, null, 2) : JSON.stringify(toSave);
}

/**
 * Checks if annotations are empty (all arrays empty).
 */
export function isAnnotationsEmpty(annotations: TopologyAnnotations): boolean {
  return (
    (!annotations.freeTextAnnotations || annotations.freeTextAnnotations.length === 0) &&
    (!annotations.freeShapeAnnotations || annotations.freeShapeAnnotations.length === 0) &&
    (!annotations.groupStyleAnnotations || annotations.groupStyleAnnotations.length === 0) &&
    (!annotations.networkNodeAnnotations || annotations.networkNodeAnnotations.length === 0) &&
    (!annotations.nodeAnnotations || annotations.nodeAnnotations.length === 0) &&
    (!annotations.aliasEndpointAnnotations || annotations.aliasEndpointAnnotations.length === 0) &&
    (!annotations.viewerSettings || Object.keys(annotations.viewerSettings).length === 0)
  );
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrates cloudNodeAnnotations to networkNodeAnnotations.
 * Returns a new annotations object with migrations applied.
 */
export function migrateCloudToNetworkAnnotations(
  annotations: TopologyAnnotations
): TopologyAnnotations {
  // If no cloud annotations, return as-is
  // eslint-disable-next-line sonarjs/deprecation
  const cloudAnnotations = annotations.cloudNodeAnnotations;
  if (!cloudAnnotations || cloudAnnotations.length === 0) {
    return annotations;
  }

  // Create a new object with migrated data
  const result: TopologyAnnotations = {
    ...annotations,
    networkNodeAnnotations: [...(annotations.networkNodeAnnotations ?? [])],
  };

  // Build set of existing network node IDs to avoid duplicates
  const existingIds = new Set(
    result.networkNodeAnnotations?.map((nn) => nn.id) ?? []
  );

  // Migrate cloud annotations
  for (const cloud of cloudAnnotations) {
    if (existingIds.has(cloud.id)) continue;

    const networkNode: NetworkNodeAnnotation = {
      id: cloud.id,
      type: cloud.type,
      label: cloud.label,
      position: cloud.position,
      group: cloud.group,
      level: cloud.level,
    };
    result.networkNodeAnnotations!.push(networkNode);
  }

  // Clear cloud annotations (will be removed on save)
  // eslint-disable-next-line sonarjs/deprecation
  result.cloudNodeAnnotations = [];

  return result;
}

/**
 * Applies all migrations to annotations.
 */
export function migrateAnnotations(annotations: TopologyAnnotations): TopologyAnnotations {
  return migrateCloudToNetworkAnnotations(annotations);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates nodeAnnotations and adds errors to the errors array.
 */
function validateNodeAnnotations(annotations: TopologyAnnotations, errors: string[]): void {
  if (!annotations.nodeAnnotations) return;
  for (const ann of annotations.nodeAnnotations) {
    if (!ann.id) errors.push('NodeAnnotation missing id');
  }
}

/**
 * Validates networkNodeAnnotations and adds errors to the errors array.
 */
function validateNetworkNodeAnnotations(annotations: TopologyAnnotations, errors: string[]): void {
  if (!annotations.networkNodeAnnotations) return;
  for (const ann of annotations.networkNodeAnnotations) {
    if (!ann.id) errors.push('NetworkNodeAnnotation missing id');
    if (!ann.type) errors.push(`NetworkNodeAnnotation ${ann.id} missing type`);
  }
}

/**
 * Validates groupStyleAnnotations and adds errors to the errors array.
 */
function validateGroupStyleAnnotations(annotations: TopologyAnnotations, errors: string[]): void {
  if (!annotations.groupStyleAnnotations) return;
  for (const ann of annotations.groupStyleAnnotations) {
    if (!ann.id) errors.push('GroupStyleAnnotation missing id');
    if (!ann.level) errors.push(`GroupStyleAnnotation ${ann.id} missing level`);
  }
}

/**
 * Validates annotation structure.
 * Returns an array of validation errors (empty if valid).
 */
export function validateAnnotations(annotations: TopologyAnnotations): string[] {
  const errors: string[] = [];
  validateNodeAnnotations(annotations, errors);
  validateNetworkNodeAnnotations(annotations, errors);
  validateGroupStyleAnnotations(annotations, errors);
  return errors;
}
