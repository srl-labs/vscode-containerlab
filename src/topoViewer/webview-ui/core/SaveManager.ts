// file: managerSaveTopo.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from '../cytoscape/BaseStyles';
import { VscodeMessageSender } from './VscodeMessaging';
import { log } from '../../logging/logger';
import topoViewerState from '../../state';
import { isSpecialEndpoint } from '../../utilities/specialNodes';
import { updateNodePosition, handleGeoData } from '../nodes/NodeUtils';

/**
 * Handles saving topology data from the Cytoscape viewport.
 */
export class ManagerSaveTopo {
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  public getMessageSender(): VscodeMessageSender {
    return this.messageSender;
  }

  /**
   * Updates node positions and sends the topology data to the backend.
   */
  public async saveTopo(
    cy: cytoscape.Core,
    suppressNotification = false
  ): Promise<void> {
    const isVscodeDeployment = true;
    if (!isVscodeDeployment) return;

    try {
      log.debug('saveTopo triggered');
      const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
      const updatedNodes = this.collectNodes(cy, layoutMgr);
      const updatedEdges = this.collectEdges(cy);

      await this.applyPostLoadStyles(cy, suppressNotification);

      const updatedElements = [...updatedNodes, ...updatedEdges];
      log.debug(`Updated Topology Data: ${JSON.stringify(updatedElements, null, 2)}`);

      const mode = (window as any).topoViewerMode;
      const endpoint = this.getEndpoint(mode, suppressNotification);

      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        endpoint,
        updatedElements
      );
      log.debug(`Response from backend: ${JSON.stringify(response)}`);

      // Note: Free text annotations save themselves when they change,
      // so we don't need to save them here
      // Note: The backend handles showing the notification message in view mode
    } catch (err) {
      log.error(`Backend call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private collectNodes(cy: cytoscape.Core, layoutMgr?: any): any[] {
    return cy
      .nodes()
      // Free text and free shape annotations have their own persistence path and should never be
      // included in the topology payload sent back to the extension.
      .filter((node: cytoscape.NodeSingular) => {
        const role = node.data('topoViewerRole');
        return role !== 'freeText' && role !== 'freeShape';
      })
      .map((node: cytoscape.NodeSingular) => this.prepareNodeJson(node, layoutMgr));
  }

  private prepareNodeJson(node: cytoscape.NodeSingular, layoutMgr?: any): any {
    const nodeJson: any = node.json();
    const isGeo = !!layoutMgr?.isGeoMapInitialized;
    updateNodePosition(node, nodeJson, isGeo);
    handleGeoData(node, nodeJson, isGeo, layoutMgr);
    if (!isGeo && nodeJson.data?.geoLayoutActive) delete nodeJson.data.geoLayoutActive;

    const parentCollection = node.parent();
    nodeJson.parent = parentCollection.nonempty() ? parentCollection[0].id() : '';
    return nodeJson;
  }

  private collectEdges(cy: cytoscape.Core): any[] {
    return cy.edges().reduce((acc: any[], edge: cytoscape.EdgeSingular) => {
      const edgeJson = this.prepareEdgeJson(edge);
      if (edgeJson) acc.push(edgeJson);
      return acc;
    }, [] as any[]);
  }

  private prepareEdgeJson(edge: cytoscape.EdgeSingular): any | null {
    const edgeJson: any = edge.json();
    if (!edgeJson.data) return null;

    const sourceId = edgeJson.data.source;
    const targetId = edgeJson.data.target;
    const sourceEp = edgeJson.data.sourceEndpoint;
    const targetEp = edgeJson.data.targetEndpoint;
    const endpoints = edgeJson.data.endpoints;

    const isSourceSpecial = isSpecialEndpoint(sourceId);
    const isTargetSpecial = isSpecialEndpoint(targetId);

    if (
      (isSourceSpecial || (typeof sourceEp === 'string' && sourceEp)) &&
      (isTargetSpecial || (typeof targetEp === 'string' && targetEp))
    ) {
      const sourceEndpoint = isSourceSpecial ? sourceId : `${sourceId}:${sourceEp}`;
      const targetEndpoint = isTargetSpecial ? targetId : `${targetId}:${targetEp}`;
      edgeJson.data.endpoints = [sourceEndpoint, targetEndpoint];
      return edgeJson;
    }

    if (
      Array.isArray(endpoints) &&
      endpoints.length === 2 &&
      endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'))
    ) {
      return edgeJson;
    }

    return null;
  }

  private async applyPostLoadStyles(cy: cytoscape.Core, suppressNotification: boolean): Promise<void> {
    const freeTextManager = topoViewerState.editorEngine?.freeTextManager;
    const freeShapesManager = topoViewerState.editorEngine?.freeShapesManager;
    if (!suppressNotification) {
      await loadCytoStyle(cy);
      const groupStyleManager = topoViewerState.editorEngine?.groupStyleManager;
      groupStyleManager
        ?.getGroupStyles()
        .forEach((style: any) => groupStyleManager.applyStyleToNode(style.id));
      freeTextManager?.reapplyAllFreeTextStyles();
      freeShapesManager?.reapplyAllShapeStyles();
      return;
    }

    const lm = topoViewerState.editorEngine?.layoutAlgoManager;
    if (lm?.isGeoMapInitialized) {
      const factor = lm.calculateGeoScale();
      lm.applyGeoScale(true, factor);
    }
    freeTextManager?.reapplyAllFreeTextStyles();
    freeShapesManager?.reapplyAllShapeStyles();
  }

  private getEndpoint(mode: string, suppressNotification: boolean): string {
    if (mode === 'viewer') {
      return 'topo-viewport-save';
    }

    return suppressNotification
      ? 'topo-editor-viewport-save-suppress-notification'
      : 'topo-editor-viewport-save';
  }
}
