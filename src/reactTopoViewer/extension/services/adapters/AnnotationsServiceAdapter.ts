/**
 * Annotations Service Adapter
 *
 * Adapter for AnnotationsIO
 * Can be instantiated with a custom instance or defaults to the extension singleton
 */

import { nodeFsAdapter, AnnotationsIO } from '../../../shared/io';
import type { IAnnotationsService, IOLogger } from '../../../shared/messaging';
import type { TopologyAnnotations } from '../../../shared/types/topology';

import { extensionLogger } from './loggerAdapter';

/**
 * Singleton AnnotationsIO instance for the VS Code extension.
 * Uses NodeFsAdapter for direct file system access.
 */
export const annotationsIO = new AnnotationsIO({
  fs: nodeFsAdapter,
  logger: extensionLogger as IOLogger,
});

export class AnnotationsServiceAdapter implements IAnnotationsService {
  constructor(private io: AnnotationsIO = annotationsIO) {}

  async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    return this.io.loadAnnotations(yamlFilePath);
  }

  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    await this.io.saveAnnotations(yamlFilePath, annotations);
  }

  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    await this.io.modifyAnnotations(yamlFilePath, modifier);
  }
}
