/**
 * Lifecycle Service Adapter
 *
 * Adapter for LabLifecycleService
 */

import type { ILifecycleService } from '../../../shared/messaging';
import { labLifecycleService } from '../LabLifecycleService';

export class LifecycleServiceAdapter implements ILifecycleService {
  async handleLifecycleCommand(command: string, yamlFilePath: string): Promise<{ result?: string; error?: string }> {
    const res = await labLifecycleService.handleLabLifecycleEndpoint(command, yamlFilePath);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }
}
