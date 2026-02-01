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
import { enqueueHostCommand } from "./topologyHostQueue";
import { applySnapshotToStores } from "./topologyHostSync";

const HOST_ACK = "topology-host:ack" as const;
const HOST_REJECT = "topology-host:reject" as const;

interface ExecuteOptions {
  applySnapshot?: boolean;
}

function notifyDevHostUpdate(): void {
  if (typeof window === "undefined") return;
  const dev = (window as unknown as { __DEV__?: { onHostUpdate?: () => void } }).__DEV__;
  dev?.onHostUpdate?.();
}

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

  const applySnapshotAndNotify = (snapshot: TopologySnapshot) => {
    applySnapshotToStores(snapshot);
    notifyDevHostUpdate();
  };

  const setRevisionAndNotify = (revision: number, snapshot?: TopologySnapshot) => {
    setHostRevision(revision);
    if (snapshot) {
      syncUndoRedo(snapshot);
    }
    notifyDevHostUpdate();
  };

  switch (response.type) {
    case HOST_ACK:
      return handleAckResponse(response, applySnapshot, applySnapshotAndNotify, setRevisionAndNotify);
    case HOST_REJECT:
      return handleRejectResponse(response, applySnapshot, applySnapshotAndNotify, setRevisionAndNotify);
    case "topology-host:error":
      throw new Error(response.error);
    default:
      return response;
  }
}

async function handleAckResponse(
  response: TopologyHostResponseMessage,
  applySnapshot: boolean,
  applySnapshotAndNotify: (snapshot: TopologySnapshot) => void,
  setRevisionAndNotify: (revision: number, snapshot?: TopologySnapshot) => void
): Promise<TopologyHostResponseMessage> {
  if (response.type !== HOST_ACK) return response;

  if (response.snapshot) {
    if (applySnapshot) {
      applySnapshotAndNotify(response.snapshot);
    } else {
      setRevisionAndNotify(response.snapshot.revision, response.snapshot);
    }
    return response;
  }

  if (applySnapshot) {
    const snapshot = await requestSnapshot();
    applySnapshotAndNotify(snapshot);
    return response;
  }

  setRevisionAndNotify(response.revision);
  return response;
}

function handleRejectResponse(
  response: TopologyHostResponseMessage,
  applySnapshot: boolean,
  applySnapshotAndNotify: (snapshot: TopologySnapshot) => void,
  setRevisionAndNotify: (revision: number, snapshot?: TopologySnapshot) => void
): TopologyHostResponseMessage {
  if (response.type !== HOST_REJECT) return response;

  if (applySnapshot) {
    applySnapshotAndNotify(response.snapshot);
  } else {
    setRevisionAndNotify(response.snapshot.revision, response.snapshot);
  }
  return response;
}

export async function executeTopologyCommand(
  command: TopologyHostCommand,
  options: ExecuteOptions = {}
): Promise<TopologyHostResponseMessage> {
  if (useTopoViewerStore.getState().isProcessing) {
    throw new Error("TopoViewer is processing; edits are temporarily disabled.");
  }
  const run = async () => {
    const applySnapshot = options.applySnapshot ?? true;
    const response = await dispatchTopologyCommand(command);
    return handleHostResponse(response, applySnapshot);
  };
  return enqueueHostCommand(run);
}

export async function executeTopologyCommands(
  commands: TopologyHostCommand[],
  options: ExecuteOptions = {}
): Promise<TopologyHostResponseMessage | null> {
  if (useTopoViewerStore.getState().isProcessing) {
    throw new Error("TopoViewer is processing; edits are temporarily disabled.");
  }
  const run = async () => {
    const applySnapshot = options.applySnapshot ?? true;
    let lastResponse: TopologyHostResponseMessage | null = null;

    for (const command of commands) {
      const response = await dispatchTopologyCommand(command);
      lastResponse = await handleHostResponse(response, false);

      if (response.type === HOST_REJECT) {
        if (applySnapshot) {
          applySnapshotToStores(response.snapshot);
        }
        return response;
      }
    }

    if (applySnapshot) {
      if (lastResponse?.type === HOST_ACK && lastResponse.snapshot) {
        applySnapshotToStores(lastResponse.snapshot);
      } else {
        const snapshot = await requestSnapshot();
        applySnapshotToStores(snapshot);
      }
    }

    return lastResponse;
  };
  return enqueueHostCommand(run);
}

export async function refreshTopologySnapshot(
  options: { externalChange?: boolean } = {}
): Promise<TopologySnapshot> {
  const snapshot = await requestSnapshot(options);
  applySnapshotToStores(snapshot);
  notifyDevHostUpdate();
  return snapshot;
}
