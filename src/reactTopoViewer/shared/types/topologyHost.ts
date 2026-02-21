/**
 * TopologyHost interface (shared contract).
 *
 * Implementations live in:
 * - VS Code extension host (production)
 * - Dev server (standalone)
 */

import type {
  TopologySnapshot,
  TopologyHostCommand,
  TopologyHostResponseMessage,
} from "./messages";

export interface TopologyHost {
  getSnapshot(): Promise<TopologySnapshot>;
  applyCommand(
    command: TopologyHostCommand,
    baseRevision: number
  ): Promise<TopologyHostResponseMessage>;
  onExternalChange(): Promise<TopologySnapshot>;
  dispose(): void;
}
