/**
 * Webview Services Initialization
 *
 * This module initializes the core I/O services (TopologyIO, AnnotationsIO)
 * with the appropriate FileSystemAdapter for the current environment.
 *
 * Environment detection:
 * - VS Code webview: Uses PostMessageFsAdapter
 * - Dev/standalone: Uses HttpFsAdapter
 */

import { FileSystemAdapter, TopologyIO, AnnotationsIO, IOLogger, noopLogger } from '../../shared/io/browser';
import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../shared/types/topology';
import type { NodeSaveData, LinkSaveData } from '../../shared/io/TopologyIO';

// Global service instances
let annotationsIO: AnnotationsIO | null = null;
let topologyIO: TopologyIO | null = null;
let fsAdapter: FileSystemAdapter | null = null;

// Error message constant
const ERROR_NOT_INITIALIZED = 'Services not initialized. Call initializeServices() first.';

/**
 * Browser console logger adapter
 */
const browserLogger: IOLogger = {
  debug: (msg: string) => console.debug(`[Services] ${msg}`),
  info: (msg: string) => console.info(`[Services] ${msg}`),
  warn: (msg: string) => console.warn(`[Services] ${msg}`),
  error: (msg: string) => console.error(`[Services] ${msg}`),
};

/**
 * Initialize the I/O services with a FileSystemAdapter.
 * Call this once at app startup.
 *
 * @param adapter - FileSystemAdapter implementation (PostMessageFsAdapter or HttpFsAdapter)
 * @param options - Optional configuration
 */
export function initializeServices(
  adapter: FileSystemAdapter,
  options: { verbose?: boolean } = {}
): void {
  const logger = options.verbose ? browserLogger : noopLogger;

  fsAdapter = adapter;

  annotationsIO = new AnnotationsIO({
    fs: adapter,
    logger,
  });

  topologyIO = new TopologyIO({
    fs: adapter,
    annotationsIO,
    logger,
  });

  logger.info('Services initialized');
}

/**
 * Get the FileSystemAdapter instance.
 * @throws Error if services not initialized
 */
export function getFsAdapter(): FileSystemAdapter {
  if (!fsAdapter) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return fsAdapter;
}

/**
 * Get the TopologyIO instance.
 * @throws Error if services not initialized
 */
export function getTopologyIO(): TopologyIO {
  if (!topologyIO) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return topologyIO;
}

/**
 * Get the AnnotationsIO instance.
 * @throws Error if services not initialized
 */
export function getAnnotationsIO(): AnnotationsIO {
  if (!annotationsIO) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return annotationsIO;
}

/**
 * Check if services have been initialized.
 */
export function isServicesInitialized(): boolean {
  return fsAdapter !== null && topologyIO !== null && annotationsIO !== null;
}

/**
 * Reset services (mainly for testing).
 */
export function resetServices(): void {
  fsAdapter = null;
  topologyIO = null;
  annotationsIO = null;
}

// ============================================================================
// Annotation Saving Helpers
// ============================================================================

// Warning messages
const WARN_SERVICES_NOT_INIT = '[Services] Cannot save annotations: services not initialized';
const WARN_NO_YAML_PATH = '[Services] Cannot save annotations: no YAML file path';

/**
 * Save free text annotations via AnnotationsIO.
 * Uses the current topology file path from TopologyIO.
 */
export async function saveFreeTextAnnotations(annotations: FreeTextAnnotation[]): Promise<void> {
  if (!topologyIO || !annotationsIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

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
  if (!topologyIO || !annotationsIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

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
  if (!topologyIO || !annotationsIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

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

// ============================================================================
// Node/Link CRUD Helpers
// ============================================================================

// Re-export types for convenience
export type { NodeSaveData, LinkSaveData };

/**
 * Create a new node via TopologyIO.
 * Saves to YAML and annotations file.
 */
export async function createNode(nodeData: NodeSaveData): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.addNode(nodeData);
    if (!result.success) {
      console.error(`[Services] Failed to create node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to create node: ${err}`);
  }
}

/**
 * Edit an existing node via TopologyIO.
 * Handles renames and updates annotations.
 */
export async function editNode(nodeData: NodeSaveData): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.editNode(nodeData);
    if (!result.success) {
      console.error(`[Services] Failed to edit node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to edit node: ${err}`);
  }
}

/**
 * Delete a node via TopologyIO.
 * Removes from YAML and annotations file.
 */
export async function deleteNode(nodeId: string): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.deleteNode(nodeId);
    if (!result.success) {
      console.error(`[Services] Failed to delete node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to delete node: ${err}`);
  }
}

/**
 * Create a new link via TopologyIO.
 * Saves to YAML file.
 */
export async function createLink(linkData: LinkSaveData): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.addLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to create link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to create link: ${err}`);
  }
}

/**
 * Edit an existing link via TopologyIO.
 */
export async function editLink(linkData: LinkSaveData): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.editLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to edit link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to edit link: ${err}`);
  }
}

/**
 * Delete a link via TopologyIO.
 */
export async function deleteLink(linkData: LinkSaveData): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.deleteLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to delete link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to delete link: ${err}`);
  }
}

/**
 * Save node positions via TopologyIO.
 */
export async function saveNodePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const result = await topologyIO.savePositions(positions);
    if (!result.success) {
      console.error(`[Services] Failed to save positions: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to save positions: ${err}`);
  }
}

/**
 * Begin a batch operation (defers saves until endBatch).
 */
export function beginBatch(): void {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }
  topologyIO.beginBatch();
}

/**
 * End a batch operation and flush pending saves.
 */
export async function endBatch(): Promise<void> {
  if (!topologyIO) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }
  await topologyIO.endBatch();
}
