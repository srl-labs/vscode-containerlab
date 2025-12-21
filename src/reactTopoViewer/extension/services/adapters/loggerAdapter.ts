/**
 * Logger Adapter
 *
 * Extension logger adapter for IOLogger interface
 */

import type { IOLogger } from '../../../shared/messaging';
import { log } from '../logger';

/**
 * Extension logger adapter
 */
export const extensionLogger: IOLogger = {
  debug: (msg: string) => log.debug(msg),
  info: (msg: string) => log.info(msg),
  warn: (msg: string) => log.warn(msg),
  error: (msg: string) => log.error(msg),
};
