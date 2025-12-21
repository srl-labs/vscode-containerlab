/**
 * Annotation Save Helpers
 *
 * Helper functions for saving annotation data via AnnotationsIO.
 */

import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../shared/types/topology';

import { getTopologyIO, getAnnotationsIO, isServicesInitialized } from './serviceInitialization';

// Warning messages
const WARN_SERVICES_NOT_INIT = '[Services] Cannot save annotations: services not initialized';
const WARN_NO_YAML_PATH = '[Services] Cannot save annotations: no YAML file path';

/**
 * Save free text annotations via AnnotationsIO.
 * Uses the current topology file path from TopologyIO.
 */
export async function saveFreeTextAnnotations(annotations: FreeTextAnnotation[]): Promise<void> {
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

  await annotationsIO.modifyAnnotations(yamlPath, current => ({
    ...current,
    freeTextAnnotations: annotations,
  }));
}

/**
 * Save free shape annotations via AnnotationsIO.
 * Uses the current topology file path from TopologyIO.
 */
export async function saveFreeShapeAnnotations(annotations: FreeShapeAnnotation[]): Promise<void> {
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

  await annotationsIO.modifyAnnotations(yamlPath, current => ({
    ...current,
    freeShapeAnnotations: annotations,
  }));
}

/**
 * Save group style annotations via AnnotationsIO.
 * Uses the current topology file path from TopologyIO.
 */
export async function saveGroupStyleAnnotations(annotations: GroupStyleAnnotation[]): Promise<void> {
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

  await annotationsIO.modifyAnnotations(yamlPath, current => ({
    ...current,
    groupStyleAnnotations: annotations,
  }));
}
