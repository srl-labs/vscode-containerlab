/**
 * Graph label migrator for detecting and converting graph-* YAML labels to annotations.
 * Pure functions - no VS Code dependencies, no I/O.
 */

import type { ClabTopology, TopologyAnnotations, NodeAnnotation } from '../types/topology';
import { createEmptyAnnotations } from '../annotations/types';

import type { GraphLabelMigration } from './types';

// ============================================================================
// Detection
// ============================================================================

/**
 * Checks if a node has graph-* labels that need migration.
 */
export function nodeHasGraphLabels(labels: Record<string, unknown> | undefined): boolean {
  if (!labels) return false;
  return Boolean(
    labels['graph-posX'] ||
      labels['graph-posY'] ||
      labels['graph-icon'] ||
      labels['graph-group'] ||
      labels['graph-level'] ||
      labels['graph-groupLabelPos'] ||
      labels['graph-geoCoordinateLat'] ||
      labels['graph-geoCoordinateLng']
  );
}

/**
 * Checks if a topology has any nodes with graph-* labels.
 */
export function topologyHasGraphLabels(parsed: ClabTopology): boolean {
  const nodes = parsed.topology?.nodes;
  if (!nodes) return false;
  return Object.values(nodes).some((node) => nodeHasGraphLabels(node?.labels as Record<string, unknown>));
}

// ============================================================================
// Migration Building
// ============================================================================

/**
 * Builds an annotation object from graph-* labels.
 */
export function buildAnnotationFromLabels(
  nodeName: string,
  labels: Record<string, unknown>
): GraphLabelMigration | null {
  if (!nodeHasGraphLabels(labels)) return null;

  const migration: GraphLabelMigration = { nodeId: nodeName };

  if (labels['graph-posX'] && labels['graph-posY']) {
    migration.position = {
      x: parseInt(labels['graph-posX'] as string, 10) || 0,
      y: parseInt(labels['graph-posY'] as string, 10) || 0,
    };
  }

  if (labels['graph-icon']) {
    migration.icon = labels['graph-icon'] as string;
  }
  if (labels['graph-group']) {
    migration.group = labels['graph-group'] as string;
  }
  if (labels['graph-level']) {
    migration.level = labels['graph-level'] as string;
  }
  if (labels['graph-groupLabelPos']) {
    migration.groupLabelPos = labels['graph-groupLabelPos'] as string;
  }

  if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
    migration.geoCoordinates = {
      lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
      lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0,
    };
  }

  return migration;
}

/**
 * Converts a GraphLabelMigration to a NodeAnnotation.
 */
export function migrationToNodeAnnotation(migration: GraphLabelMigration): NodeAnnotation {
  const annotation: NodeAnnotation = { id: migration.nodeId };
  if (migration.position) {
    annotation.position = migration.position;
  }
  if (migration.icon) {
    annotation.icon = migration.icon;
  }
  if (migration.group) {
    annotation.group = migration.group;
  }
  if (migration.level) {
    annotation.level = migration.level;
  }
  if (migration.groupLabelPos) {
    annotation.groupLabelPos = migration.groupLabelPos;
  }
  if (migration.geoCoordinates) {
    annotation.geoCoordinates = migration.geoCoordinates;
  }
  return annotation;
}

// ============================================================================
// Detection and Collection
// ============================================================================

/**
 * Detects graph-* label migrations needed for a topology.
 * Returns migrations for nodes that have graph-* labels but no existing annotation.
 */
export function detectGraphLabelMigrations(
  parsed: ClabTopology,
  annotations?: TopologyAnnotations
): GraphLabelMigration[] {
  const migrations: GraphLabelMigration[] = [];
  const nodes = parsed.topology?.nodes;
  if (!nodes) return migrations;

  const existingAnnotations = new Set(
    annotations?.nodeAnnotations?.map((na) => na.id) ?? []
  );

  for (const [nodeName, nodeObj] of Object.entries(nodes)) {
    // Skip if node already has an annotation
    if (existingAnnotations.has(nodeName)) continue;
    // Skip if node has no graph-* labels
    const labels = nodeObj?.labels as Record<string, unknown>;
    if (!nodeHasGraphLabels(labels)) continue;

    const migration = buildAnnotationFromLabels(nodeName, labels);
    if (migration) {
      migrations.push(migration);
    }
  }

  return migrations;
}

/**
 * Creates base annotations from existing annotations.
 */
function createBaseAnnotations(annotations: TopologyAnnotations | undefined): TopologyAnnotations {
  const base = createEmptyAnnotations();
  if (!annotations) return base;
  const nodeAnnotations = annotations.nodeAnnotations ?? base.nodeAnnotations ?? [];
  return {
    ...base,
    ...annotations,
    nodeAnnotations: [...nodeAnnotations],
  };
}

/**
 * Applies graph label migrations to annotations.
 * Returns a new annotations object with migrations applied.
 */
export function applyGraphLabelMigrations(
  annotations: TopologyAnnotations | undefined,
  migrations: GraphLabelMigration[]
): TopologyAnnotations {
  const result = createBaseAnnotations(annotations);

  for (const migration of migrations) {
    const newAnnotation = migrationToNodeAnnotation(migration);
    result.nodeAnnotations!.push(newAnnotation);
  }

  return result;
}

/**
 * Checks if migrations were applied and returns the result.
 * This is a convenience function that combines detection and application.
 */
export function processGraphLabelMigrations(
  parsed: ClabTopology,
  annotations?: TopologyAnnotations
): { annotations: TopologyAnnotations; migrations: GraphLabelMigration[]; needsSave: boolean } {
  const migrations = detectGraphLabelMigrations(parsed, annotations);
  if (migrations.length === 0) {
    return {
      annotations: annotations ?? {
        freeTextAnnotations: [],
        freeShapeAnnotations: [],
        groupStyleAnnotations: [],
        networkNodeAnnotations: [],
        nodeAnnotations: [],
        edgeAnnotations: [],
        aliasEndpointAnnotations: [],
        viewerSettings: {},
      },
      migrations: [],
      needsSave: false,
    };
  }

  const updatedAnnotations = applyGraphLabelMigrations(annotations, migrations);
  return {
    annotations: updatedAnnotations,
    migrations,
    needsSave: true,
  };
}
