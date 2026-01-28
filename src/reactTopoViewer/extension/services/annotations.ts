/**
 * Extension-side AnnotationsIO singleton.
 *
 * Used to load/save/migrate annotations files alongside a topology YAML.
 */

import { AnnotationsIO, nodeFsAdapter } from "../../shared/io";
import type { IOLogger } from "../../shared/io/types";

import { log } from "./logger";

const extensionIoLogger: IOLogger = {
  debug: (msg: string) => log.debug(msg),
  info: (msg: string) => log.info(msg),
  warn: (msg: string) => log.warn(msg),
  error: (msg: string) => log.error(msg)
};

export const annotationsIO = new AnnotationsIO({
  fs: nodeFsAdapter,
  logger: extensionIoLogger
});
