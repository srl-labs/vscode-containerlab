/**
 * Initialize the webview state from the host snapshot.
 */

import { useEffect } from "react";

import { requestSnapshot } from "../../services/topologyHostClient";
import { applySnapshotToStores } from "../../services/topologyHostSync";
import { log } from "../../utils/logger";

export function useTopologyHostInitialization(): void {
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const snapshot = await requestSnapshot();
        if (!disposed) {
          applySnapshotToStores(snapshot);
        }
      } catch (err) {
        log.error(
          `[TopologyHost] Failed to load snapshot: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);
}
