/**
 * Persistence Service Adapter
 *
 * Adapter for TopologyIO
 * Requires a TopologyIO instance (no default singleton since TopologyIO needs per-file initialization)
 */

import type { TopologyIO } from '../../../shared/io';
import type {
  IPersistenceService,
  SaveResult,
  NodeSaveData,
  LinkSaveData,
  NodePositionData,
} from '../../../shared/messaging';

export class PersistenceServiceAdapter implements IPersistenceService {
  constructor(private service: TopologyIO) {}

  isInitialized(): boolean {
    return this.service.isInitialized();
  }

  beginBatch(): void {
    this.service.beginBatch();
  }

  async endBatch(): Promise<SaveResult> {
    return this.service.endBatch();
  }

  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    return this.service.addNode(nodeData);
  }

  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    return this.service.editNode(nodeData);
  }

  async deleteNode(nodeId: string): Promise<SaveResult> {
    return this.service.deleteNode(nodeId);
  }

  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.addLink(linkData);
  }

  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.editLink(linkData);
  }

  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.deleteLink(linkData);
  }

  async savePositions(positions: NodePositionData[]): Promise<SaveResult> {
    return this.service.savePositions(positions);
  }
}
