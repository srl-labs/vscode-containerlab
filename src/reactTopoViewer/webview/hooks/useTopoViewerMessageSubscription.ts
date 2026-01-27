/**
 * useTopoViewerMessageSubscription - Message subscription hook for UI state updates
 *
 * Handles extension messages related to TopoViewer UI state:
 * - topo-mode-changed: Update mode, deploymentState
 * - panel-action: Trigger edit/select actions
 * - custom-nodes-updated: Update customNodes
 * - custom-node-error: Show error
 * - icon-list-response: Update customIcons
 * - lab-lifecycle-status: Clear processing state
 */
import { useEffect } from "react";

import type { CustomNodeTemplate } from "../../shared/types/editors";
import type { CustomIconInfo } from "../../shared/types/icons";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../utils/webviewMessageBus";
import { useTopoViewerStore, type DeploymentState } from "../stores/topoViewerStore";

// ============================================================================
// Message Types
// ============================================================================

interface TopoModeChangedMessage {
  type: "topo-mode-changed";
  data?: {
    mode?: string;
    deploymentState?: DeploymentState;
  };
}

interface PanelActionMessage {
  type: "panel-action";
  action?: string;
  nodeId?: string;
  edgeId?: string;
}

interface CustomNodesUpdatedMessage {
  type: "custom-nodes-updated";
  customNodes?: CustomNodeTemplate[];
  defaultNode?: string;
}

interface CustomNodeErrorMessage {
  type: "custom-node-error";
  error?: string;
}

interface IconListResponseMessage {
  type: "icon-list-response";
  icons?: CustomIconInfo[];
}

interface LabLifecycleStatusMessage {
  type: "lab-lifecycle-status";
}

type ExtensionMessage =
  | TopoModeChangedMessage
  | PanelActionMessage
  | CustomNodesUpdatedMessage
  | CustomNodeErrorMessage
  | IconListResponseMessage
  | LabLifecycleStatusMessage
  | { type: string; data?: Record<string, unknown> };

// ============================================================================
// Message Handlers
// ============================================================================

function handleTopoModeChanged(msg: TopoModeChangedMessage): void {
  const { setMode, setDeploymentState } = useTopoViewerStore.getState();

  if (msg.data?.mode) {
    const modeValue = msg.data.mode;
    const normalizedMode = modeValue === "viewer" || modeValue === "view" ? "view" : "edit";
    setMode(normalizedMode);
  }

  if (msg.data?.deploymentState) {
    setDeploymentState(msg.data.deploymentState);
  }
}

function handlePanelAction(msg: PanelActionMessage): void {
  const { selectNode, selectEdge, editNode, editEdge } = useTopoViewerStore.getState();
  const action = msg.action;
  const nodeId = msg.nodeId;
  const edgeId = msg.edgeId;

  if (!action) return;

  if (action === "edit-node" && nodeId) {
    editNode(nodeId);
    return;
  }
  if (action === "edit-link" && edgeId) {
    editEdge(edgeId);
    return;
  }
  if (action === "node-info" && nodeId) {
    selectNode(nodeId);
    return;
  }
  if (action === "link-info" && edgeId) {
    selectEdge(edgeId);
  }
}

function handleCustomNodesUpdated(msg: CustomNodesUpdatedMessage): void {
  const { setCustomNodes } = useTopoViewerStore.getState();
  if (msg.customNodes !== undefined) {
    setCustomNodes(msg.customNodes, msg.defaultNode || "");
  }
}

function handleCustomNodeError(msg: CustomNodeErrorMessage): void {
  const { setCustomNodeError } = useTopoViewerStore.getState();
  if (msg.error) {
    setCustomNodeError(msg.error);
  }
}

function handleIconListResponse(msg: IconListResponseMessage): void {
  const { setCustomIcons } = useTopoViewerStore.getState();
  if (msg.icons !== undefined) {
    setCustomIcons(msg.icons);
  }
}

function handleLabLifecycleStatus(): void {
  const { setProcessing } = useTopoViewerStore.getState();
  setProcessing(false);
}

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
      const message = event.data as ExtensionMessage | undefined;
      if (!message?.type) return;

      switch (message.type) {
        case "topo-mode-changed":
          handleTopoModeChanged(message as TopoModeChangedMessage);
          break;
        case "panel-action":
          handlePanelAction(message as PanelActionMessage);
          break;
        case "custom-nodes-updated":
          handleCustomNodesUpdated(message as CustomNodesUpdatedMessage);
          break;
        case "custom-node-error":
          handleCustomNodeError(message as CustomNodeErrorMessage);
          break;
        case "icon-list-response":
          handleIconListResponse(message as IconListResponseMessage);
          break;
        case "lab-lifecycle-status":
          handleLabLifecycleStatus();
          break;
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, []);
}
