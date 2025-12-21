/**
 * Node Command Service Adapter
 *
 * Adapter for NodeCommandService
 */

import type { INodeCommandService } from '../../../shared/messaging';
import { nodeCommandService } from '../NodeCommandService';

export class NodeCommandServiceAdapter implements INodeCommandService {
  constructor(private yamlFilePath: string) {}

  async handleNodeCommand(command: string, nodeName: string): Promise<{ result?: string; error?: string }> {
    nodeCommandService.setYamlFilePath(this.yamlFilePath);
    const res = await nodeCommandService.handleNodeEndpoint(command, nodeName);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }

  async handleInterfaceCommand(
    command: string,
    params: { nodeName: string; interfaceName: string }
  ): Promise<{ result?: string; error?: string }> {
    nodeCommandService.setYamlFilePath(this.yamlFilePath);
    const res = await nodeCommandService.handleInterfaceEndpoint(command, params);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }

  setYamlFilePath(yamlFilePath: string): void {
    this.yamlFilePath = yamlFilePath;
  }
}
