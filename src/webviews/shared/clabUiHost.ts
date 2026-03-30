import {
  TOPOLOGY_HOST_PROTOCOL_VERSION,
  type TopologyHostCommand,
  type TopologyHostResponseMessage,
  type TopologySnapshot
} from "@srl-labs/clab-ui/core/types/messages";
import type {
  ClabUiHost,
  ClabUiTopoViewerEvent,
  TopologyUiContext,
  TopologyUiRequestOptions,
  TopoViewerLifecycleAction,
  TopoViewerNodeAction,
  TopoViewerSvgExportPayload
} from "@srl-labs/clab-ui/host";
import type { ExplorerIncomingMessage, ExplorerUiState } from "@srl-labs/clab-ui/explorer";

declare global {
  interface Window {
    acquireVsCodeApi?: () => NonNullable<Window["vscode"]>;
  }
}

type TopologyHostMessageType =
  | "topology-host:snapshot"
  | "topology-host:ack"
  | "topology-host:reject"
  | "topology-host:error";

interface PendingTopologyRequest {
  resolve: (value: TopologyHostResponseMessage | TopologySnapshot) => void;
  reject: (err: Error) => void;
  expectedType: "snapshot" | "command";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExplorerIncomingMessage(value: unknown): value is ExplorerIncomingMessage {
  if (!isRecord(value) || typeof value.command !== "string") {
    return false;
  }

  switch (value.command) {
    case "snapshot":
      return typeof value.filterText === "string" && Array.isArray(value.sections);
    case "filterState":
      return typeof value.filterText === "string";
    case "uiState":
      return isRecord(value.state) || value.state === undefined;
    case "error":
      return typeof value.message === "string";
    default:
      return false;
  }
}

function toTopoViewerEvent(value: unknown): ClabUiTopoViewerEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "topo-mode-changed": {
      const data = isRecord(value.data) ? value.data : undefined;
      const mode = data?.mode;
      const deploymentState = data?.deploymentState;
      if (
        (mode === "editor" || mode === "viewer" || mode === "view") &&
        (deploymentState === "deployed" ||
          deploymentState === "undeployed" ||
          deploymentState === "unknown")
      ) {
        return {
          type: "modeChanged",
          mode: mode === "view" ? "viewer" : mode,
          deploymentState
        };
      }
      return null;
    }
    case "panel-action":
      return typeof value.action === "string"
        ? {
            type: "panelAction",
            action: value.action,
            ...(typeof value.nodeId === "string" ? { nodeId: value.nodeId } : {}),
            ...(typeof value.edgeId === "string" ? { edgeId: value.edgeId } : {})
          }
        : null;
    case "custom-nodes-updated":
      return {
        type: "customNodesUpdated",
        customNodes: Array.isArray(value.customNodes) ? value.customNodes : [],
        defaultNode: typeof value.defaultNode === "string" ? value.defaultNode : ""
      };
    case "custom-node-error":
      return typeof value.error === "string"
        ? { type: "customNodeError", error: value.error }
        : null;
    case "icon-list-response":
      return {
        type: "iconList",
        icons: Array.isArray(value.icons) ? value.icons : []
      };
    case "lab-lifecycle-log": {
      const data = isRecord(value.data) ? value.data : undefined;
      return typeof data?.line === "string"
        ? {
            type: "lifecycleLog",
            line: data.line,
            stream: data.stream === "stderr" ? "stderr" : "stdout"
          }
        : null;
    }
    case "lab-lifecycle-status": {
      const data = isRecord(value.data) ? value.data : undefined;
      if (data?.status !== "success" && data?.status !== "error") {
        return null;
      }
      return {
        type: "lifecycleStatus",
        status: data.status,
        ...(typeof data.errorMessage === "string" ? { errorMessage: data.errorMessage } : {})
      };
    }
    case "fit-viewport":
      return { type: "fitViewport" };
    case "svg-export-result":
      return typeof value.requestId === "string" && typeof value.success === "boolean"
        ? {
            type: "svgExportResult",
            requestId: value.requestId,
            success: value.success,
            ...(typeof value.error === "string" ? { error: value.error } : {}),
            ...(Array.isArray(value.files)
              ? { files: value.files.filter((entry): entry is string => typeof entry === "string") }
              : {})
          }
        : null;
    default:
      return null;
  }
}

function isTopologyHostMessageType(value: unknown): value is TopologyHostMessageType {
  return (
    value === "topology-host:snapshot" ||
    value === "topology-host:ack" ||
    value === "topology-host:reject" ||
    value === "topology-host:error"
  );
}

function isTopologySnapshot(value: unknown): value is TopologySnapshot {
  return (
    isRecord(value) &&
    typeof value.revision === "number" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    isRecord(value.annotations)
  );
}

function isTopologyHostResponseMessage(value: unknown): value is TopologyHostResponseMessage {
  return (
    isRecord(value) &&
    isTopologyHostMessageType(value.type) &&
    typeof value.requestId === "string" &&
    typeof value.protocolVersion === "number"
  );
}

function resolveVsCodeApi(targetWindow: Window): NonNullable<Window["vscode"]> {
  if (targetWindow.vscode) {
    return targetWindow.vscode;
  }

  if (typeof targetWindow.acquireVsCodeApi === "function") {
    const api = targetWindow.acquireVsCodeApi();
    targetWindow.vscode = api;
    return api;
  }

  throw new Error("VS Code API is unavailable in this webview runtime");
}

function getNodeActionCommand(action: TopoViewerNodeAction): string {
  if (action === "ssh") {
    return "clab-node-connect-ssh";
  }

  if (action === "shell") {
    return "clab-node-attach-shell";
  }

  return "clab-node-view-logs";
}

export function createVsCodeClabUiHost(targetWindow: Window = window): ClabUiHost {
  const vscodeApi = resolveVsCodeApi(targetWindow);

  const subscribe = (handler: (event: MessageEvent<unknown>) => void): (() => void) => {
    const listener = (event: Event) => {
      handler(event as MessageEvent<unknown>);
    };
    targetWindow.addEventListener("message", listener);
    return () => {
      targetWindow.removeEventListener("message", listener);
    };
  };

  const postMessage = (message: unknown): void => {
    vscodeApi.postMessage(message);
  };

  const topology = (() => {
    const pending = new Map<string, PendingTopologyRequest>();
    let listenerStarted = false;

    const ensureListener = (): void => {
      if (listenerStarted) return;
      subscribe((event) => {
        if (!isRecord(event.data) || !isTopologyHostMessageType(event.data.type)) {
          return;
        }

        const requestId = event.data.requestId;
        if (typeof requestId !== "string" || requestId.length === 0) {
          return;
        }

        const request = pending.get(requestId);
        if (!request) {
          return;
        }

        if (event.data.type === "topology-host:snapshot") {
          if (request.expectedType !== "snapshot" || !isTopologySnapshot(event.data.snapshot)) {
            request.reject(new Error("Unexpected snapshot response"));
            pending.delete(requestId);
            return;
          }

          request.resolve(event.data.snapshot);
          pending.delete(requestId);
          return;
        }

        if (request.expectedType !== "command" || !isTopologyHostResponseMessage(event.data)) {
          request.reject(new Error("Unexpected command response"));
          pending.delete(requestId);
          return;
        }

        request.resolve(event.data);
        pending.delete(requestId);
      });
      listenerStarted = true;
    };

    const sendRequest = (
      message: Record<string, unknown>,
      expectedType: "snapshot" | "command",
      timeoutMs = 30_000
    ): Promise<TopologyHostResponseMessage | TopologySnapshot> => {
      ensureListener();
      const requestId = globalThis.crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject, expectedType });
        postMessage({ ...message, requestId });
        setTimeout(() => {
          if (!pending.has(requestId)) {
            return;
          }
          pending.delete(requestId);
          reject(
            new Error(`${expectedType === "snapshot" ? "Snapshot" : "Command"} request timed out`)
          );
        }, timeoutMs);
      });
    };

    return {
      async requestSnapshot(
        _context: TopologyUiContext,
        options: TopologyUiRequestOptions = {}
      ): Promise<TopologySnapshot> {
        return (await sendRequest(
          {
            type: "topology-host:get-snapshot",
            protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
            externalChange: options.externalChange ?? false
          },
          "snapshot"
        )) as TopologySnapshot;
      },

      async dispatchCommand(
        _context: TopologyUiContext,
        revision: number,
        command: TopologyHostCommand
      ): Promise<TopologyHostResponseMessage> {
        return (await sendRequest(
          {
            type: "topology-host:command",
            protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
            baseRevision: revision,
            command
          },
          "command"
        )) as TopologyHostResponseMessage;
      }
    };
  })();

  return {
    postMessage,
    subscribe,
    meta: {
      isDevMock: false,
      disableDevMockTraffic: false
    },
    explorer: {
      connect(): void {
        postMessage({ command: "ready" });
      },
      setFilter(filterText: string): void {
        postMessage({ command: "setFilter", value: filterText });
      },
      invokeAction(actionRef: string): void {
        postMessage({ command: "invokeAction", actionRef });
      },
      persistUiState(state: ExplorerUiState): void {
        postMessage({ command: "persistUiState", state });
      },
      subscribe(handler: (message: ExplorerIncomingMessage) => void): () => void {
        return subscribe((event) => {
          if (isExplorerIncomingMessage(event.data)) {
            handler(event.data);
          }
        });
      }
    },
    topoViewer: {
      runLifecycle(action: TopoViewerLifecycleAction): void {
        postMessage({ command: action });
      },
      cancelLifecycle(): void {
        postMessage({ command: "cancelLabLifecycle" });
      },
      toggleSplitView(): void {
        postMessage({ command: "topo-toggle-split-view" });
      },
      runNodeAction(action: TopoViewerNodeAction, nodeName: string): void {
        const command = getNodeActionCommand(action);
        postMessage({ command, nodeName });
      },
      captureInterface(nodeName: string, interfaceName: string): void {
        postMessage({ command: "clab-interface-capture", nodeName, interfaceName });
      },
      setLinkImpairment(nodeName: string, interfaceName: string, data: unknown): void {
        postMessage({ command: "clab-link-impairment", nodeName, interfaceName, data });
      },
      saveCustomNode(data: Record<string, unknown>): void {
        postMessage({ command: "save-custom-node", ...data });
      },
      deleteCustomNode(nodeName: string): void {
        postMessage({ command: "delete-custom-node", name: nodeName });
      },
      setDefaultCustomNode(nodeName: string): void {
        postMessage({ command: "set-default-custom-node", name: nodeName });
      },
      requestIconList(): void {
        postMessage({ command: "icon-list" });
      },
      uploadIcon(): void {
        postMessage({ command: "icon-upload" });
      },
      deleteIcon(iconName: string): void {
        postMessage({ command: "icon-delete", iconName });
      },
      reconcileIcons(usedIcons: string[]): void {
        postMessage({ command: "icon-reconcile", usedIcons });
      },
      exportGrafanaBundle(payload: TopoViewerSvgExportPayload): void {
        postMessage({ command: "export-svg-grafana-bundle", ...payload });
      },
      dumpCssVars(vars: Record<string, string>): void {
        postMessage({ command: "dump-css-vars", vars });
      },
      subscribe(handler: (event: ClabUiTopoViewerEvent) => void): () => void {
        return subscribe((event) => {
          const topoViewerEvent = toTopoViewerEvent(event.data);
          if (topoViewerEvent) {
            handler(topoViewerEvent);
          }
        });
      }
    },
    topology
  };
}
