/**
 * Custom Node Service Adapter
 *
 * Adapter for CustomNodeConfigManager
 */

import type { ICustomNodeService } from '../../../shared/messaging';
import { customNodeConfigManager } from '../CustomNodeConfigManager';

type CustomNodeResult = { customNodes: unknown[]; defaultNode: string };

export class CustomNodeServiceAdapter implements ICustomNodeService {
  async saveCustomNode(nodeData: { name: string; [key: string]: unknown }): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.saveCustomNode(nodeData);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }

  async deleteCustomNode(name: string): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.deleteCustomNode(name);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }

  async setDefaultCustomNode(name: string): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.setDefaultCustomNode(name);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }
}
