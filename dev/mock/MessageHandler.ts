/**
 * MessageHandler - Route and handle webview messages in dev mode
 *
 * This simulates the extension's MessageRouter behavior,
 * handling commands sent via vscode.postMessage().
 */

import type { DevStateManager } from './DevState';
import type { RequestHandler } from './RequestHandler';
import type { LatencySimulator } from './LatencySimulator';
import type { SplitViewPanel } from './SplitViewPanel';
import type { CyElement, TopologyAnnotations } from '../../src/reactTopoViewer/shared/types/topology';
import { sendMessageToWebviewWithLog } from './VscodeApiMock';

// ============================================================================
// Types
// ============================================================================

export interface WebviewMessage {
  type?: string;
  command?: string;
  requestId?: string;
  endpointName?: string;
  payload?: unknown;
  data?: unknown;
  // Common fields
  nodeId?: string;
  edgeId?: string;
  nodeName?: string;
  nodeData?: Record<string, unknown>;
  linkData?: Record<string, unknown>;
  position?: { x: number; y: number };
  positions?: Array<{ id: string; position: { x: number; y: number } }>;
  annotations?: unknown;
  [key: string]: unknown;
}

// Command categories (matching MessageRouter.ts)
const NODE_COMMANDS = new Set([
  'clab-node-connect-ssh',
  'clab-node-attach-shell',
  'clab-node-view-logs'
]);

const LIFECYCLE_COMMANDS = new Set([
  'deployLab',
  'destroyLab',
  'deployLabCleanup',
  'destroyLabCleanup',
  'redeployLab',
  'redeployLabCleanup'
]);

const EDITOR_COMMANDS = new Set([
  'create-node',
  'save-node-editor',
  'apply-node-editor',
  'create-link',
  'save-link-editor',
  'apply-link-editor',
  'save-lab-settings'
]);

const PANEL_COMMANDS = new Set([
  'panel-node-info',
  'panel-edit-node',
  'panel-delete-node',
  'panel-link-info',
  'panel-edit-link',
  'panel-delete-link'
]);

const ANNOTATION_COMMANDS = new Set([
  'save-node-positions',
  'save-network-position',
  'save-free-text-annotations',
  'save-free-shape-annotations',
  'save-group-style-annotations',
  'save-node-group-membership'
]);

const CUSTOM_NODE_COMMANDS = new Set([
  'save-custom-node',
  'delete-custom-node',
  'set-default-custom-node'
]);

const CLIPBOARD_COMMANDS = new Set([
  'copyElements',
  'getCopiedElements'
]);

const BATCH_COMMANDS = new Set([
  'begin-graph-batch',
  'end-graph-batch'
]);

// ============================================================================
// MessageHandler Class
// ============================================================================

export class MessageHandler {
  private stateManager: DevStateManager;
  private requestHandler: RequestHandler;
  private latencySimulator: LatencySimulator;
  private splitViewPanel: SplitViewPanel | null = null;

  constructor(
    stateManager: DevStateManager,
    requestHandler: RequestHandler,
    latencySimulator: LatencySimulator
  ) {
    this.stateManager = stateManager;
    this.requestHandler = requestHandler;
    this.latencySimulator = latencySimulator;
  }

  /** Set the split view panel reference */
  setSplitViewPanel(panel: SplitViewPanel): void {
    this.splitViewPanel = panel;
  }

  // --------------------------------------------------------------------------
  // Main Entry Point
  // --------------------------------------------------------------------------

  /**
   * Handle a message from the webview
   */
  handleMessage(message: unknown): void {
    const msg = message as WebviewMessage;

    // Skip log messages
    if (this.isLogMessage(msg)) {
      this.handleLogMessage(msg);
      return;
    }

    // Handle POST requests via RequestHandler
    if (this.requestHandler.isPostRequest(message)) {
      this.requestHandler.handleRequest(message as any);
      return;
    }

    // Route to appropriate handler
    const messageType = msg.command || msg.type || '';

    if (BATCH_COMMANDS.has(messageType)) {
      this.handleBatchCommand(messageType);
    } else if (LIFECYCLE_COMMANDS.has(messageType)) {
      this.handleLifecycleCommand(messageType, msg);
    } else if (NODE_COMMANDS.has(messageType)) {
      this.handleNodeCommand(messageType, msg);
    } else if (EDITOR_COMMANDS.has(messageType)) {
      this.handleEditorCommand(messageType, msg);
    } else if (PANEL_COMMANDS.has(messageType)) {
      this.handlePanelCommand(messageType, msg);
    } else if (ANNOTATION_COMMANDS.has(messageType)) {
      this.handleAnnotationCommand(messageType, msg);
    } else if (CUSTOM_NODE_COMMANDS.has(messageType)) {
      this.handleCustomNodeCommand(messageType, msg);
    } else if (CLIPBOARD_COMMANDS.has(messageType)) {
      this.handleClipboardCommand(messageType, msg);
    } else if (messageType === 'topo-toggle-split-view') {
      this.handleToggleSplitView();
    } else {
      // Unknown command - just log it
      console.log(
        '%c[Mock Extension]',
        'color: #FF9800;',
        `Unhandled command: ${messageType}`,
        msg
      );
    }
  }

  // --------------------------------------------------------------------------
  // Log Messages
  // --------------------------------------------------------------------------

  private isLogMessage(msg: WebviewMessage): boolean {
    return msg.command === 'reactTopoViewerLog' || msg.command === 'topoViewerLog';
  }

  private handleLogMessage(msg: WebviewMessage): void {
    const level = msg.level || 'info';
    const logMsg = msg.message || '';

    switch (level) {
      case 'error':
        console.error('%c[Webview]', 'color: #f44336;', logMsg);
        break;
      case 'warn':
        console.warn('%c[Webview]', 'color: #FF9800;', logMsg);
        break;
      case 'debug':
        console.debug('%c[Webview]', 'color: #9E9E9E;', logMsg);
        break;
      default:
        console.log('%c[Webview]', 'color: #2196F3;', logMsg);
    }
  }

  // --------------------------------------------------------------------------
  // Batch Commands
  // --------------------------------------------------------------------------

  private handleBatchCommand(type: string): void {
    const filename = this.stateManager.getCurrentFilePath();

    if (type === 'begin-graph-batch') {
      this.stateManager.beginBatch();
      // Start batch on server-side TopologyIO
      if (filename) {
        this.callTopologyIOEndpoint('POST', `/api/topology/${encodeURIComponent(filename)}/batch/begin`);
      }
    } else if (type === 'end-graph-batch') {
      const shouldBroadcast = this.stateManager.endBatch();
      // End batch on server-side TopologyIO (flushes pending saves)
      if (filename) {
        this.callTopologyIOEndpoint('POST', `/api/topology/${encodeURIComponent(filename)}/batch/end`);
      }
      if (shouldBroadcast) {
        this.broadcastTopologyData();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle Commands
  // --------------------------------------------------------------------------

  private handleLifecycleCommand(type: string, msg: WebviewMessage): void {
    console.log('%c[Mock Extension]', 'color: #FF9800;', `Lifecycle: ${type}`);

    if (type === 'deployLab' || type === 'redeployLab') {
      this.latencySimulator.simulateCallback('lifecycle', () => {
        this.stateManager.setDeploymentState('deployed');
        this.stateManager.setMode('view');
        sendMessageToWebviewWithLog(
          {
            type: 'topo-mode-changed',
            data: { mode: 'viewer', deploymentState: 'deployed' }
          },
          'deploy-complete'
        );
      });
    } else if (type === 'destroyLab') {
      this.latencySimulator.simulateCallback('lifecycle', () => {
        this.stateManager.setDeploymentState('undeployed');
        this.stateManager.setMode('edit');
        sendMessageToWebviewWithLog(
          {
            type: 'topo-mode-changed',
            data: { mode: 'editor', deploymentState: 'undeployed' }
          },
          'destroy-complete'
        );
      });
    }
  }

  // --------------------------------------------------------------------------
  // Node Commands (SSH, logs, etc.)
  // --------------------------------------------------------------------------

  private handleNodeCommand(type: string, msg: WebviewMessage): void {
    const nodeName = this.getNodeName(msg);
    console.log(
      '%c[Mock Extension]',
      'color: #FF9800;',
      `Node command: ${type} on "${nodeName}"`
    );

    // In dev mode, just log - these would open terminals in real extension
    if (type === 'clab-node-connect-ssh') {
      console.log(`%c[Mock] Would SSH to: ${nodeName}`, 'color: #4CAF50;');
    } else if (type === 'clab-node-attach-shell') {
      console.log(`%c[Mock] Would attach shell to: ${nodeName}`, 'color: #4CAF50;');
    } else if (type === 'clab-node-view-logs') {
      console.log(`%c[Mock] Would view logs for: ${nodeName}`, 'color: #4CAF50;');
    }
  }

  // --------------------------------------------------------------------------
  // Editor Commands (create/save nodes and links)
  // --------------------------------------------------------------------------

  private handleEditorCommand(type: string, msg: WebviewMessage): void {
    console.log('%c[Mock Extension]', 'color: #FF9800;', `Editor: ${type}`, msg);

    switch (type) {
      case 'create-node':
        this.handleCreateNode(msg);
        break;
      case 'save-node-editor':
      case 'apply-node-editor':
        this.handleSaveNodeEditor(msg);
        break;
      case 'create-link':
        this.handleCreateLink(msg);
        break;
      case 'save-link-editor':
      case 'apply-link-editor':
        this.handleSaveLinkEditor(msg);
        break;
      case 'save-lab-settings':
        console.log('%c[Mock]', 'color: #4CAF50;', 'Lab settings:', msg);
        break;
    }

    this.updateSplitView();
    this.maybeBroadcastTopology();
  }

  private handleCreateNode(msg: WebviewMessage): void {
    const { nodeId, nodeData, position } = msg as {
      nodeId: string;
      nodeData: Record<string, unknown>;
      position: { x: number; y: number };
    };

    if (!nodeId || !nodeData) return;

    const nodePosition = position || { x: 100, y: 100 };
    const node: CyElement = {
      group: 'nodes',
      data: { id: nodeId, ...nodeData },
      position: nodePosition
    };

    // Update local state for UI
    this.stateManager.addNode(node);

    // Add to node annotations (local state)
    const annotations = this.stateManager.getAnnotations();
    const nodeAnnotations = [...(annotations.nodeAnnotations || [])];
    if (!nodeAnnotations.find(a => a.id === nodeId)) {
      nodeAnnotations.push({ id: nodeId, position: nodePosition });
      this.stateManager.updateAnnotations({ nodeAnnotations });
    }

    // Persist via TopologyIO endpoint (handles both YAML and annotations)
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      const extraData = nodeData.extraData as Record<string, unknown> | undefined;
      this.callTopologyIOEndpoint('POST', `/api/topology/${encodeURIComponent(filename)}/node`, {
        name: nodeId,
        position: nodePosition,
        extraData: {
          kind: nodeData.kind || extraData?.kind,
          type: nodeData.type || extraData?.type,
          image: nodeData.image || extraData?.image,
          topoViewerRole: extraData?.topoViewerRole,
          iconColor: extraData?.iconColor,
          iconCornerRadius: extraData?.iconCornerRadius,
          interfacePattern: extraData?.interfacePattern,
        },
      });
    }
  }

  private handleSaveNodeEditor(msg: WebviewMessage): void {
    const nodeData = msg.nodeData || (msg.payload as Record<string, unknown>);
    if (!nodeData) return;

    // In containerlab, the node name IS the ID in YAML
    // nodeData.name = the new name user entered
    // nodeData.id = original cytoscape ID (may differ from name after rename)
    const newName = (nodeData.name as string) || (nodeData.id as string);
    if (!newName) return;

    // Handle rename if oldName is provided and different from new name
    const oldName = msg.oldName as string | undefined;
    if (oldName && oldName !== newName) {
      console.log('%c[Mock]', 'color: #4CAF50;', `Renaming node: ${oldName} -> ${newName}`);
      // This is a rename - need to update the node ID in local state
      const elements = this.stateManager.getElements();
      const updated = elements.map(el => {
        if (el.group === 'nodes' && el.data.id === oldName) {
          return {
            ...el,
            data: { ...el.data, ...nodeData, id: newName, name: newName }
          };
        }
        // Update edges that reference the old name
        if (el.group === 'edges') {
          const newData = { ...el.data };
          if (newData.source === oldName) newData.source = newName;
          if (newData.target === oldName) newData.target = newName;
          return { ...el, data: newData };
        }
        return el;
      });
      this.stateManager.updateElements(updated);

      // Update annotations in local state
      const annotations = this.stateManager.getAnnotations();
      const nodeAnnotations = (annotations.nodeAnnotations || []).map(a =>
        a.id === oldName ? { ...a, id: newName } : a
      );
      this.stateManager.updateAnnotations({ nodeAnnotations });
    } else {
      // Just update the node data in local state (no rename)
      const existingId = (nodeData.id as string) || newName;
      this.stateManager.updateNodeData(existingId, nodeData);
    }

    // Persist via TopologyIO endpoint (handles both YAML and annotation rename)
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      this.callTopologyIOEndpoint('PUT', `/api/topology/${encodeURIComponent(filename)}/node`, {
        id: oldName || newName, // Original ID for matching
        name: newName,
        kind: nodeData.kind,
        type: nodeData.type,
        image: nodeData.image,
      });
    }

    // Note: Don't broadcast - webview already has the data.
    // Real extension just persists to files, doesn't reload canvas.
  }

  private handleCreateLink(msg: WebviewMessage): void {
    const { linkData } = msg as {
      linkData: {
        id: string;
        source: string;
        target: string;
        sourceEndpoint?: string;
        targetEndpoint?: string;
      };
    };

    if (!linkData) return;

    const srcEp = linkData.sourceEndpoint || 'eth1';
    const tgtEp = linkData.targetEndpoint || 'eth1';

    const edge: CyElement = {
      group: 'edges',
      data: {
        id: linkData.id,
        source: linkData.source,
        target: linkData.target,
        sourceEndpoint: srcEp,
        targetEndpoint: tgtEp
      }
    };

    // Update local state for UI
    this.stateManager.addEdge(edge);

    // Persist via TopologyIO endpoint
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      this.callTopologyIOEndpoint('POST', `/api/topology/${encodeURIComponent(filename)}/link`, {
        source: linkData.source,
        target: linkData.target,
        sourceEndpoint: srcEp,
        targetEndpoint: tgtEp,
      });
    }
  }

  private handleSaveLinkEditor(msg: WebviewMessage): void {
    const linkData = msg.linkData || (msg.payload as Record<string, unknown>);
    if (!linkData) return;

    const edgeId = linkData.id as string;
    if (!edgeId) return;

    // Get original endpoint values for link matching (before edit)
    const originalSourceEndpoint = msg.originalSourceEndpoint as string | undefined;
    const originalTargetEndpoint = msg.originalTargetEndpoint as string | undefined;

    // Update edge data in local state with all fields from editor
    this.stateManager.updateEdgeData(edgeId, {
      source: linkData.source,
      target: linkData.target,
      sourceEndpoint: linkData.sourceEndpoint,
      targetEndpoint: linkData.targetEndpoint,
      // Additional properties
      type: linkData.type,
      mtu: linkData.mtu,
      sourceMac: linkData.sourceMac,
      targetMac: linkData.targetMac,
      vars: linkData.vars,
      labels: linkData.labels
    });

    // Persist via TopologyIO endpoint
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      this.callTopologyIOEndpoint('PUT', `/api/topology/${encodeURIComponent(filename)}/link`, {
        source: linkData.source,
        target: linkData.target,
        sourceEndpoint: linkData.sourceEndpoint,
        targetEndpoint: linkData.targetEndpoint,
        // Original values for matching the link in YAML
        originalSourceEndpoint,
        originalTargetEndpoint,
      });
    }

    // Note: Don't broadcast - webview already has the data.
    // Real extension just persists to files, doesn't reload canvas.
  }

  // --------------------------------------------------------------------------
  // Panel Commands (info, edit, delete)
  // --------------------------------------------------------------------------

  private handlePanelCommand(type: string, msg: WebviewMessage): void {
    console.log('%c[Mock Extension]', 'color: #FF9800;', `Panel: ${type}`, msg);

    if (type === 'panel-delete-node') {
      const nodeId = msg.nodeId as string;
      if (nodeId) {
        // Update local state
        this.stateManager.removeNode(nodeId);

        // Persist via TopologyIO endpoint (handles both YAML and annotations)
        const filename = this.stateManager.getCurrentFilePath();
        if (filename) {
          this.callTopologyIOEndpoint('DELETE', `/api/topology/${encodeURIComponent(filename)}/node/${encodeURIComponent(nodeId)}`);
        }

        this.updateSplitView();
        this.maybeBroadcastTopology();
      }
    } else if (type === 'panel-delete-link') {
      const edgeId = msg.edgeId as string;
      if (edgeId) {
        // Find the edge to get source/target info for deletion
        const elements = this.stateManager.getElements();
        const edge = elements.find(el => el.group === 'edges' && el.data.id === edgeId);

        // Update local state
        this.stateManager.removeEdge(edgeId);

        // Persist via TopologyIO endpoint
        const filename = this.stateManager.getCurrentFilePath();
        if (filename && edge) {
          this.callTopologyIOEndpoint('DELETE', `/api/topology/${encodeURIComponent(filename)}/link`, {
            source: edge.data.source,
            target: edge.data.target,
            sourceEndpoint: edge.data.sourceEndpoint,
            targetEndpoint: edge.data.targetEndpoint,
          });
        }

        this.updateSplitView();
        this.maybeBroadcastTopology();
      }
    }
    // Info and edit commands just need to trigger the panel UI
    // which is handled by the webview itself
  }

  // --------------------------------------------------------------------------
  // Annotation Commands
  // --------------------------------------------------------------------------

  private async handleAnnotationCommand(type: string, msg: WebviewMessage): Promise<void> {
    console.log('%c[Mock Extension]', 'color: #FF9800;', `Annotation: ${type}`);

    switch (type) {
      case 'save-node-positions':
        this.handleSaveNodePositions(msg);
        break;
      case 'save-network-position':
        this.handleSaveNetworkPosition(msg);
        break;
      case 'save-free-text-annotations':
        this.handleSaveFreeTextAnnotations(msg);
        break;
      case 'save-free-shape-annotations':
        this.handleSaveFreeShapeAnnotations(msg);
        break;
      case 'save-group-style-annotations':
        this.handleSaveGroupStyleAnnotations(msg);
        break;
      case 'save-node-group-membership':
        this.handleSaveNodeGroupMembership(msg);
        break;
    }

    // Save annotations to file (await to ensure completion before returning)
    await this.saveAnnotationsToFile();

    this.updateSplitView();
  }

  private handleSaveNodePositions(msg: WebviewMessage): void {
    const positions = msg.positions as Array<{
      id: string;
      position: { x: number; y: number };
    }>;
    if (positions && Array.isArray(positions)) {
      // Update local state - saveAnnotationsToFile() is called by the parent handler
      // to persist changes to file (no separate TopologyIO call needed to avoid race)
      this.stateManager.updateNodePositions(positions);
    }
  }

  private handleSaveNetworkPosition(msg: WebviewMessage): void {
    const { nodeId, position, type: nodeType, label } = msg as {
      nodeId: string;
      position: { x: number; y: number };
      type?: string;
      label?: string;
    };

    if (!nodeId || !position) return;

    const annotations = this.stateManager.getAnnotations() as any;
    const networkAnnotations = [...(annotations.networkNodeAnnotations || [])];

    const existing = networkAnnotations.find((a: any) => a.id === nodeId);
    if (existing) {
      existing.position = position;
    } else {
      networkAnnotations.push({
        id: nodeId,
        type: nodeType || 'host',
        label: label || nodeId,
        position
      });
    }

    this.stateManager.updateAnnotations({ networkNodeAnnotations: networkAnnotations } as any);
  }

  private handleSaveFreeTextAnnotations(msg: WebviewMessage): void {
    const annotations = msg.annotations as TopologyAnnotations['freeTextAnnotations'];
    if (annotations) {
      this.stateManager.updateAnnotations({ freeTextAnnotations: annotations });
    }
  }

  private handleSaveFreeShapeAnnotations(msg: WebviewMessage): void {
    const annotations = msg.annotations as TopologyAnnotations['freeShapeAnnotations'];
    if (annotations) {
      this.stateManager.updateAnnotations({ freeShapeAnnotations: annotations });
    }
  }

  private handleSaveGroupStyleAnnotations(msg: WebviewMessage): void {
    const annotations = msg.annotations as TopologyAnnotations['groupStyleAnnotations'];
    if (annotations) {
      this.stateManager.updateAnnotations({ groupStyleAnnotations: annotations });
    }
  }

  private handleSaveNodeGroupMembership(msg: WebviewMessage): void {
    const { nodeId, group, level } = msg as {
      nodeId: string;
      group: string | null;
      level: string | null;
    };

    if (nodeId) {
      this.stateManager.updateNodeGroupMembership(nodeId, group, level);
    }
  }

  // --------------------------------------------------------------------------
  // Custom Node Commands
  // --------------------------------------------------------------------------

  private handleCustomNodeCommand(type: string, msg: WebviewMessage): void {
    console.log('%c[Mock Extension]', 'color: #FF9800;', `Custom Node: ${type}`, msg);

    const customNodes = [...this.stateManager.getCustomNodes()];

    if (type === 'save-custom-node') {
      const { name, kind, type: nodeType, image, icon, baseName, interfacePattern, setDefault } = msg as Record<string, unknown>;

      const newNode = {
        name: name as string,
        kind: kind as string,
        type: nodeType as string,
        image: image as string,
        icon: icon as string,
        baseName: baseName as string,
        interfacePattern: interfacePattern as string
      };

      const existingIndex = customNodes.findIndex(n => n.name === name);
      if (existingIndex >= 0) {
        customNodes[existingIndex] = newNode as any;
      } else {
        customNodes.push(newNode as any);
      }

      this.stateManager.setCustomNodes(customNodes);

      if (setDefault) {
        this.stateManager.setDefaultCustomNode(name as string);
      }

      // Broadcast to webview
      this.broadcastCustomNodes();
    } else if (type === 'delete-custom-node') {
      const { name } = msg as { name: string };
      const filtered = customNodes.filter(n => n.name !== name);
      this.stateManager.setCustomNodes(filtered);

      // Clear default if it was the deleted node
      const state = this.stateManager.getState();
      if (state.defaultCustomNode === name) {
        this.stateManager.setDefaultCustomNode(null);
      }

      this.broadcastCustomNodes();
    } else if (type === 'set-default-custom-node') {
      const { name } = msg as { name: string };
      this.stateManager.setDefaultCustomNode(name);
      this.broadcastCustomNodes();
    }
  }

  private broadcastCustomNodes(): void {
    const state = this.stateManager.getState();
    sendMessageToWebviewWithLog(
      {
        type: 'custom-nodes-updated',
        customNodes: state.customNodes,
        defaultNode: state.defaultCustomNode
      },
      'custom-nodes'
    );
  }

  // --------------------------------------------------------------------------
  // Clipboard Commands
  // --------------------------------------------------------------------------

  private handleClipboardCommand(type: string, msg: WebviewMessage): void {
    if (type === 'copyElements') {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Copying to clipboard:', msg.payload);
      this.stateManager.setClipboard(msg.payload);
    } else if (type === 'getCopiedElements') {
      const clipboard = this.stateManager.getClipboard();
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Paste requested, clipboard:', clipboard);

      if (clipboard) {
        // Send clipboard data back asynchronously (simulates real extension)
        setTimeout(() => {
          sendMessageToWebviewWithLog(
            {
              type: 'copiedElements',
              data: clipboard
            },
            'paste'
          );
        }, 0);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Split View
  // --------------------------------------------------------------------------

  private handleToggleSplitView(): void {
    console.log('%c[Mock Extension]', 'color: #FF9800;', 'Toggle split view');
    if (this.splitViewPanel) {
      this.splitViewPanel.toggle();
    }
  }

  private updateSplitView(): void {
    if (this.splitViewPanel) {
      this.splitViewPanel.updateContent();
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getNodeName(msg: WebviewMessage): string {
    const raw = msg.nodeName ?? msg.payload;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && typeof (raw as any).nodeName === 'string') {
      return (raw as any).nodeName;
    }
    return '';
  }

  private maybeBroadcastTopology(): void {
    if (this.stateManager.isInBatch()) {
      this.stateManager.setPendingBroadcast(true);
    }
  }

  /** Build API URL with optional session ID */
  private buildApiUrl(path: string): string {
    const sessionId = (window as any).__TEST_SESSION_ID__;
    if (sessionId) {
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}sessionId=${sessionId}`;
    }
    return path;
  }

  /**
   * Call a TopologyIO endpoint on the server.
   * These endpoints use the same orchestration as the VS Code extension:
   * - Save queue (prevents concurrent writes)
   * - Batch deferral
   * - Integrated annotation management
   */
  private callTopologyIOEndpoint(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): void {
    const url = this.buildApiUrl(path);

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          console.log('%c[TopologyIO]', 'color: #4CAF50;', `${method} ${path} succeeded`);
        } else {
          console.warn('%c[TopologyIO]', 'color: #FF9800;', `${method} ${path} failed:`, result.error);
        }
      })
      .catch(err => {
        console.error('%c[TopologyIO Error]', 'color: #f44336;', err);
      });
  }

  /** Save current annotations to file (if a file is loaded) */
  private async saveAnnotationsToFile(): Promise<void> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return;

    const annotations = this.stateManager.getAnnotations();
    const url = this.buildApiUrl(`/api/annotations/${encodeURIComponent(filename)}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotations)
      });
      const result = await res.json();
      if (result.success) {
        console.log('%c[File API]', 'color: #4CAF50;', `Saved annotations to ${filename}`);
      } else {
        console.warn('%c[File API]', 'color: #FF9800;', `Failed to save annotations: ${result.error}`);
      }
    } catch (err) {
      console.error('%c[File API Error]', 'color: #f44336;', err);
    }
  }

  /** Save current topology to YAML file (if a file is loaded) */
  private saveYamlToFile(): void {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return;

    const state = this.stateManager.getState();
    const yaml = this.generateYamlFromState(state);
    const url = this.buildApiUrl(`/api/topology/${encodeURIComponent(filename)}`);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: yaml })
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          console.log('%c[File API]', 'color: #4CAF50;', `Saved YAML to ${filename}`);
          this.stateManager.markClean();
        } else {
          console.warn('%c[File API]', 'color: #FF9800;', `Failed to save YAML: ${result.error}`);
        }
      })
      .catch(err => {
        console.error('%c[File API Error]', 'color: #f44336;', err);
      });
  }

  /** Generate YAML content from current state */
  private generateYamlFromState(state: ReturnType<typeof this.stateManager.getState>): string {
    const nodes = state.currentElements.filter(
      el => el.group === 'nodes' && el.data.topoViewerRole !== 'cloud'
    );
    const edges = state.currentElements.filter(el => el.group === 'edges');

    // Build nodes section
    const nodesYaml = nodes.map(node => {
      const data = node.data;
      // Handle both data structures:
      // - From TopologyParser: kind/type/image directly on data
      // - From useNodeCreation: kind/type/image nested in data.extraData
      const extraData = data.extraData as Record<string, unknown> | undefined;
      const kind = data.kind || extraData?.kind;
      const type = data.type || extraData?.type;
      const image = data.image || extraData?.image;

      const lines = [`    ${data.id}:`];
      if (kind) lines.push(`      kind: ${kind}`);
      if (type) lines.push(`      type: ${type}`);
      if (image) lines.push(`      image: ${image}`);
      return lines.join('\n');
    }).join('\n');

    // Build links section - only include edges between actual nodes
    const nodeIds = new Set(nodes.map(n => n.data.id));
    const linksYaml = edges
      .filter(edge => nodeIds.has(edge.data.source as string) && nodeIds.has(edge.data.target as string))
      .map(edge => {
        const data = edge.data;
        const srcEp = data.sourceEndpoint || 'eth1';
        const tgtEp = data.targetEndpoint || 'eth1';
        return `    - endpoints: ["${data.source}:${srcEp}", "${data.target}:${tgtEp}"]`;
      }).join('\n');

    return `name: ${state.labName}

topology:
  nodes:
${nodesYaml}

  links:
${linksYaml}
`;
  }

  /**
   * Broadcast current topology data to webview
   */
  broadcastTopologyData(): void {
    if (this.stateManager.isInBatch()) {
      this.stateManager.setPendingBroadcast(true);
      return;
    }

    const state = this.stateManager.getState();
    sendMessageToWebviewWithLog(
      {
        type: 'topology-data',
        data: {
          elements: state.currentElements,
          freeTextAnnotations: state.currentAnnotations.freeTextAnnotations,
          freeShapeAnnotations: state.currentAnnotations.freeShapeAnnotations,
          groupStyleAnnotations: state.currentAnnotations.groupStyleAnnotations,
          nodeAnnotations: state.currentAnnotations.nodeAnnotations,
          cloudNodeAnnotations: state.currentAnnotations.cloudNodeAnnotations,
          networkNodeAnnotations: (state.currentAnnotations as any).networkNodeAnnotations
        }
      },
      'topology-refresh'
    );
  }
}
