/**
 * useTopoViewerMessageSubscription - Message subscription hook for UI state updates
 *
 * Handles extension messages related to TopoViewer UI state:
 * - topo-mode-changed: Update mode, deploymentState
 * - panel-action: Trigger edit/select actions
 * - custom-nodes-updated: Update customNodes
 * - custom-node-error: Show error
 * - icon-list-response: Update customIcons
 * - lab-lifecycle-log: Append streaming deploy/destroy logs
 * - lab-lifecycle-status: Clear processing state
 * - fit-viewport: Fit graph to current viewport
 */
import { useEffect } from "react";

import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { CustomIconInfo } from "../../../shared/types/icons";
import {
  subscribeToWebviewMessages,
  type TypedMessageEvent,
  type WebviewMessageBase,
} from "../../messaging/webviewMessageBus";
import { useCanvasStore } from "../../stores/canvasStore";
import { useTopoViewerStore, type DeploymentState } from "../../stores/topoViewerStore";

// ============================================================================
// Message Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getMessageData(message: WebviewMessageBase): Record<string, unknown> | undefined {
  return isRecord(message.data) ? message.data : undefined;
}

function isDeploymentState(value: unknown): value is DeploymentState {
  return value === "deployed" || value === "undeployed" || value === "unknown";
}

function isCustomNodeTemplate(value: unknown): value is CustomNodeTemplate {
  return isRecord(value) && isNonEmptyString(value.name) && isNonEmptyString(value.kind);
}

function isCustomIconInfo(value: unknown): value is CustomIconInfo {
  return (
    isRecord(value) &&
    isNonEmptyString(value.name) &&
    (value.source === "workspace" || value.source === "global") &&
    isNonEmptyString(value.dataUri) &&
    (value.format === "svg" || value.format === "png")
  );
}

// ============================================================================
// Message Handlers
// ============================================================================

function handleTopoModeChanged(msg: WebviewMessageBase): void {
  const { setMode, setDeploymentState } = useTopoViewerStore.getState();
  const data = getMessageData(msg);

  if (isNonEmptyString(data?.mode)) {
    const modeValue = data.mode;
    const normalizedMode = modeValue === "viewer" || modeValue === "view" ? "view" : "edit";
    setMode(normalizedMode);
  }

  if (isDeploymentState(data?.deploymentState)) {
    setDeploymentState(data.deploymentState);
  }
}

function handlePanelAction(msg: WebviewMessageBase): void {
  const { selectNode, selectEdge, editNode, editEdge, isProcessing } =
    useTopoViewerStore.getState();
  if (isProcessing) return;
  const action = isNonEmptyString(msg.action) ? msg.action : undefined;
  const nodeId = isNonEmptyString(msg.nodeId) ? msg.nodeId : undefined;
  const edgeId = isNonEmptyString(msg.edgeId) ? msg.edgeId : undefined;

  if (action === undefined) return;

  switch (action) {
    case "edit-node":
      if (nodeId !== undefined) editNode(nodeId);
      return;
    case "edit-link":
      if (edgeId !== undefined) editEdge(edgeId);
      return;
    case "node-info":
      if (nodeId !== undefined) selectNode(nodeId);
      return;
    case "link-info":
      if (edgeId !== undefined) selectEdge(edgeId);
      break;
  }
}

function handleCustomNodesUpdated(msg: WebviewMessageBase): void {
  const { setCustomNodes } = useTopoViewerStore.getState();
  if (!Array.isArray(msg.customNodes)) return;
  const customNodes = msg.customNodes.filter(isCustomNodeTemplate);
  const defaultNode = isNonEmptyString(msg.defaultNode) ? msg.defaultNode : "";
  setCustomNodes(customNodes, defaultNode);
}

function handleCustomNodeError(msg: WebviewMessageBase): void {
  const { setCustomNodeError } = useTopoViewerStore.getState();
  if (isNonEmptyString(msg.error)) {
    setCustomNodeError(msg.error);
  }
}

function handleIconListResponse(msg: WebviewMessageBase): void {
  const { setCustomIcons } = useTopoViewerStore.getState();
  if (!Array.isArray(msg.icons)) return;
  setCustomIcons(msg.icons.filter(isCustomIconInfo));
}

function handleLabLifecycleLog(msg: WebviewMessageBase): void {
  const { appendLifecycleLog, isProcessing } = useTopoViewerStore.getState();
  if (!isProcessing) {
    return;
  }
  const data = getMessageData(msg);
  const line = data?.line;
  if (!isNonEmptyString(line)) {
    return;
  }
  const stream = data?.stream === "stderr" ? "stderr" : "stdout";
  appendLifecycleLog(line, stream);
}

function handleLabLifecycleStatus(msg: WebviewMessageBase): void {
  const { appendLifecycleLog, setLifecycleStatus, setProcessing } = useTopoViewerStore.getState();
  const data = getMessageData(msg);
  const status = data?.status;
  const errorMessage = data?.errorMessage;

  if (status === "error" && isNonEmptyString(errorMessage)) {
    appendLifecycleLog(`[error] ${errorMessage}`, "stderr");
    setLifecycleStatus("error", errorMessage);
  } else if (status === "error") {
    setLifecycleStatus("error", "Lifecycle command failed.");
  }
  if (status === "success") {
    appendLifecycleLog("Command completed successfully.", "stdout");
    setLifecycleStatus("success");
  }
  setProcessing(false);
}

function handleFitViewport(): void {
  const { requestFitView } = useCanvasStore.getState();
  requestFitView();
}

const MESSAGE_HANDLERS: Partial<Record<string, (message: WebviewMessageBase) => void>> = {
  "topo-mode-changed": handleTopoModeChanged,
  "panel-action": handlePanelAction,
  "custom-nodes-updated": handleCustomNodesUpdated,
  "custom-node-error": handleCustomNodeError,
  "icon-list-response": handleIconListResponse,
  "lab-lifecycle-log": handleLabLifecycleLog,
  "lab-lifecycle-status": handleLabLifecycleStatus,
  "fit-viewport": () => {
    handleFitViewport();
  },
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to subscribe to TopoViewer UI-related extension messages.
 * Should be called once at the app root.
 */
export function useTopoViewerMessageSubscription(): void {
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data;
      if (message === undefined || !isNonEmptyString(message.type)) return;
      const handler = MESSAGE_HANDLERS[message.type];
      if (handler !== undefined) {
        handler(message);
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, []);
}
