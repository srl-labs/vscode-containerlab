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
