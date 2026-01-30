/**
 * TopologyHost command helpers.
 *
 * Wraps host command dispatch with revision/snapshot handling.
 */

import type {
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologySnapshot
} from "../../shared/types/messages";
import { useTopoViewerStore } from "../stores/topoViewerStore";

import { dispatchTopologyCommand, requestSnapshot, setHostRevision } from "./topologyHostClient";
import { applySnapshotToStores } from "./topologyHostSync";

interface ExecuteOptions {
  applySnapshot?: boolean;
}

let commandQueue: Promise<unknown> = Promise.resolve();

async function handleHostResponse(
  response: TopologyHostResponseMessage,
  applySnapshot: boolean
): Promise<TopologyHostResponseMessage> {
  const syncUndoRedo = (snapshot: TopologySnapshot) => {
    useTopoViewerStore.getState().setInitialData({
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo
    });
  };

  if (response.type === "topology-host:ack") {
    if (response.snapshot) {
      if (applySnapshot) {
        applySnapshotToStores(response.snapshot);
      } else {
        setHostRevision(response.snapshot.revision);
        syncUndoRedo(response.snapshot);
      }
      return response;
    }

    if (applySnapshot) {
      const snapshot = await requestSnapshot();
      applySnapshotToStores(snapshot);
    } else if (typeof response.revision === "number") {
      setHostRevision(response.revision);
    }
    return response;
  }

  if (response.type === "topology-host:reject") {
    if (applySnapshot) {
      applySnapshotToStores(response.snapshot);
    } else {
      setHostRevision(response.snapshot.revision);
      syncUndoRedo(response.snapshot);
    }
    return response;
  }

  if (response.type === "topology-host:error") {
    throw new Error(response.error);
  }

  return response;
}

export async function executeTopologyCommand(
  command: TopologyHostCommand,
  options: ExecuteOptions = {}
): Promise<TopologyHostResponseMessage> {
  const run = async () => {
    const applySnapshot = options.applySnapshot ?? true;
    const response = await dispatchTopologyCommand(command);
    return handleHostResponse(response, applySnapshot);
  };

  const queued = commandQueue.then(run, run);
  commandQueue = queued.catch(() => undefined);
  return queued;
}

export async function executeTopologyCommands(
  commands: TopologyHostCommand[],
  options: ExecuteOptions = {}
): Promise<TopologyHostResponseMessage | null> {
  const run = async () => {
    const applySnapshot = options.applySnapshot ?? true;
    let lastResponse: TopologyHostResponseMessage | null = null;

    for (const command of commands) {
      const response = await dispatchTopologyCommand(command);
      lastResponse = await handleHostResponse(response, false);

      if (response.type === "topology-host:reject") {
        if (applySnapshot) {
          applySnapshotToStores(response.snapshot);
        }
        return response;
      }
    }

    if (applySnapshot) {
      if (lastResponse?.type === "topology-host:ack" && lastResponse.snapshot) {
        applySnapshotToStores(lastResponse.snapshot);
      } else {
        const snapshot = await requestSnapshot();
        applySnapshotToStores(snapshot);
      }
    }

    return lastResponse;
  };

  const queued = commandQueue.then(run, run);
  commandQueue = queued.catch(() => undefined);
  return queued;
}

export async function refreshTopologySnapshot(
  options: { externalChange?: boolean } = {}
): Promise<TopologySnapshot> {
  const snapshot = await requestSnapshot(options);
  applySnapshotToStores(snapshot);
  return snapshot;
}
