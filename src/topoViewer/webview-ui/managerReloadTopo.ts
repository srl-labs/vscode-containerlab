// file: managerReloadTopo.ts

import cytoscape from 'cytoscape';
import { fetchAndLoadData } from './managerCytoscapeFetchAndLoad';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';

/**
 * Handles reloading the topology data from the backend.
 */
export class ManagerReloadTopo {
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  public async viewportButtonsReloadTopo(
    cy: cytoscape.Core,
    delayMs = 1000
  ): Promise<void> {
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-reload-viewport',
        'Empty Payload'
      );
      log.debug(`Response from backend: ${JSON.stringify(response)}`);
      await this.sleep(delayMs);
      fetchAndLoadData(cy, this.messageSender);
    } catch (err) {
      log.error(`Backend call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}