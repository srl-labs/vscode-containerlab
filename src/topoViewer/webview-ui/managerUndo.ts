import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';

/**
 * Handles undo functionality by triggering undo on the YAML file.
 */
export class ManagerUndo {
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  /**
   * Triggers undo operation on the YAML file.
   */
  public async viewportButtonsUndo(): Promise<void> {
    try {
      log.debug('viewportButtonsUndo triggered');

      // Send message to VS Code extension to trigger undo on the YAML file
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-undo',
        {}
      );
      log.debug(`Response from backend: ${JSON.stringify(response)}`);
    } catch (err) {
      log.error(`Undo operation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}