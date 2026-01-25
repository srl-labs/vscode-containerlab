/**
 * Annotation Save Helpers
 *
 * Helper functions for saving annotation data via AnnotationsIO.
 */

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  EdgeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";

import { getTopologyIO, getAnnotationsIO, isServicesInitialized } from "./serviceInitialization";

// Warning messages
const WARN_SERVICES_NOT_INIT = "[Services] Cannot save annotations: services not initialized";
const WARN_NO_YAML_PATH = "[Services] Cannot save annotations: no YAML file path";

/**
 * Generic helper for saving annotations via AnnotationsIO.
 * Uses the current topology file path from TopologyIO.
 */
async function saveAnnotationsGeneric(
  updater: (current: TopologyAnnotations) => TopologyAnnotations
): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  const topologyIO = getTopologyIO();
  const annotationsIO = getAnnotationsIO();

  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) {
    console.warn(WARN_NO_YAML_PATH);
    return;
  }

  await annotationsIO.modifyAnnotations(yamlPath, updater);
}

/**
 * Save free text annotations via AnnotationsIO.
 */
export async function saveFreeTextAnnotations(annotations: FreeTextAnnotation[]): Promise<void> {
  await saveAnnotationsGeneric((current) => ({ ...current, freeTextAnnotations: annotations }));
}

/**
 * Save free shape annotations via AnnotationsIO.
 */
export async function saveFreeShapeAnnotations(annotations: FreeShapeAnnotation[]): Promise<void> {
  await saveAnnotationsGeneric((current) => ({ ...current, freeShapeAnnotations: annotations }));
}

/**
 * Save group style annotations via AnnotationsIO.
 */
export async function saveGroupStyleAnnotations(
  annotations: GroupStyleAnnotation[]
): Promise<void> {
  await saveAnnotationsGeneric((current) => ({ ...current, groupStyleAnnotations: annotations }));
}

/**
 * Save edge annotations via AnnotationsIO.
 */
export async function saveEdgeAnnotations(annotations: EdgeAnnotation[]): Promise<void> {
  await saveAnnotationsGeneric((current) => ({ ...current, edgeAnnotations: annotations }));
}

/**
 * Save viewer settings via AnnotationsIO.
 */
export async function saveViewerSettings(
  settings: NonNullable<TopologyAnnotations["viewerSettings"]>
): Promise<void> {
  await saveAnnotationsGeneric((current) => ({
    ...current,
    viewerSettings: {
      ...(current.viewerSettings ?? {}),
      ...settings
    }
  }));
}

/**
 * Update node group membership via AnnotationsIO.
 * Updates the `groupId` field on nodeAnnotations.
 */
export async function saveNodeGroupMembership(
  nodeId: string,
  groupId: string | null
): Promise<void> {
  await saveAnnotationsGeneric((current) => {
    const nodeAnnotations = current.nodeAnnotations ? [...current.nodeAnnotations] : [];

    const existingIndex = nodeAnnotations.findIndex((n) => n.id === nodeId);
    if (existingIndex >= 0) {
      // Update existing annotation
      const existing = nodeAnnotations[existingIndex];
      if (groupId) {
        nodeAnnotations[existingIndex] = { ...existing, groupId };
      } else {
        // Remove group fields
        const { group: _removed, groupId: _removedId, ...rest } = existing;
        nodeAnnotations[existingIndex] = rest as typeof existing;
      }
    } else if (groupId) {
      // Create new annotation with group membership
      nodeAnnotations.push({ id: nodeId, groupId });
    }

    return { ...current, nodeAnnotations };
  });
}

/**
 * Save all node group memberships at once via AnnotationsIO.
 * Replaces the entire nodeAnnotations array with the provided memberships.
 */
export async function saveAllNodeGroupMemberships(
  memberships: Array<{ id: string; groupId?: string }>
): Promise<void> {
  await saveAnnotationsGeneric((current) => {
    // Build map of new memberships
    const membershipMap = new Map(
      memberships.filter((m) => m.groupId).map((m) => [m.id, m.groupId!])
    );

    // Preserve existing nodeAnnotations but update groupId field
    const existingAnnotations = current.nodeAnnotations ?? [];
    const existingMap = new Map(existingAnnotations.map((a) => [a.id, a]));

    // Merge: update existing, add new
    const result: Array<{ id: string; groupId?: string }> = [];

    // Process memberships
    for (const [nodeId, groupId] of membershipMap) {
      const existing = existingMap.get(nodeId);
      if (existing) {
        const { group: _removed, ...rest } = existing;
        result.push({ ...rest, groupId });
        existingMap.delete(nodeId);
      } else {
        result.push({ id: nodeId, groupId });
      }
    }

    // Add remaining existing annotations that have no membership update
    // but keep them without group field
    for (const [nodeId, annotation] of existingMap) {
      if (!membershipMap.has(nodeId)) {
        // Remove group fields if node is no longer in any group
        const { group: _removed, groupId: _removedId, ...rest } = annotation;
        if (Object.keys(rest).length > 1 || (Object.keys(rest).length === 1 && rest.id)) {
          result.push(rest as typeof annotation);
        }
      }
    }

    return { ...current, nodeAnnotations: result };
  });
}
