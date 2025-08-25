// file: managerSaveTopo.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeBaseStyles';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';
import topoViewerState from '../state';
import { isSpecialEndpoint } from '../utilities/specialNodes';

/**
 * Handles saving topology data from the Cytoscape viewport.
 */
export class ManagerSaveTopo {
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  /**
   * Updates node positions and sends the topology data to the backend.
   */
  public async viewportButtonsSaveTopo(
    cy: cytoscape.Core,
    suppressNotification = false
  ): Promise<void> {
    const isVscodeDeployment = true;
    if (!isVscodeDeployment) return;

    try {
      log.debug('viewportButtonsSaveTopo triggered');

      const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
      const updatedNodes = cy.nodes().map((node: cytoscape.NodeSingular) => {
        const nodeJson: any = node.json();

        let posX = node.position().x;
        let posY = node.position().y;
        if (layoutMgr?.isGeoMapInitialized) {
          const origX = node.data('_origPosX');
          const origY = node.data('_origPosY');
          if (origX !== undefined && origY !== undefined) {
            posX = origX;
            posY = origY;
          }
        }
        nodeJson.position = { x: posX, y: posY };

        if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
          nodeJson.data = nodeJson.data || {};
          const lat = node.data('lat');
          const lng = node.data('lng');
          if (lat !== undefined && lng !== undefined) {
            nodeJson.data.lat = lat.toString();
            nodeJson.data.lng = lng.toString();
          } else {
            const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
              x: node.position().x,
              y: node.position().y
            });
            nodeJson.data.lat = latlng.lat.toString();
            nodeJson.data.lng = latlng.lng.toString();
          }
        }

        const parentCollection = node.parent();
        const parentId: string = parentCollection.nonempty() ? parentCollection[0].id() : '';
        nodeJson.parent = parentId;
        if (nodeJson.data?.extraData?.labels && parentId) {
          const parts = parentId.split(':');
          nodeJson.data.extraData.labels['graph-group'] = parts[0] || '';
          nodeJson.data.extraData.labels['graph-level'] = parts[1] || '';

          const validLabelClasses = [
            'top-center',
            'top-left',
            'top-right',
            'bottom-center',
            'bottom-left',
            'bottom-right'
          ];
          const parentElement = cy.getElementById(parentId);
          const classArray: string[] = parentElement.classes();
          const validParentClasses = classArray.filter((cls: string) =>
            validLabelClasses.includes(cls)
          );
          nodeJson.data.groupLabelPos =
            validParentClasses.length > 0 ? validParentClasses[0] : '';
        }
        return nodeJson;
      });

      const updatedEdges = cy.edges().reduce((acc: any[], edge: cytoscape.EdgeSingular) => {
        const edgeJson: any = edge.json();

        if (edgeJson.data) {
          const sourceId = edgeJson.data.source;
          const targetId = edgeJson.data.target;
          const sourceEp = edgeJson.data.sourceEndpoint;
          const targetEp = edgeJson.data.targetEndpoint;

          // Check if source or target are special nodes (host, mgmt-net, macvlan)
          const isSourceSpecial = isSpecialEndpoint(sourceId);
          const isTargetSpecial = isSpecialEndpoint(targetId);

          if (
            (isSourceSpecial || (typeof sourceEp === 'string' && sourceEp)) &&
            (isTargetSpecial || (typeof targetEp === 'string' && targetEp))
          ) {
            // For special nodes, the ID already contains the full endpoint
            const sourceEndpoint = isSourceSpecial ? sourceId : `${sourceId}:${sourceEp}`;
            const targetEndpoint = isTargetSpecial ? targetId : `${targetId}:${targetEp}`;

            edgeJson.data.endpoints = [sourceEndpoint, targetEndpoint];
            acc.push(edgeJson);
          } else if (
            Array.isArray(edgeJson.data.endpoints) &&
            edgeJson.data.endpoints.length === 2 &&
            edgeJson.data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'))
          ) {
            acc.push(edgeJson);
          }
        }

        return acc;
      }, [] as any[]);

      if (!suppressNotification) {
        loadCytoStyle(cy);

        // Reapply group styles after loadCytoStyle to maintain visual consistency
        if (topoViewerState.editorEngine?.groupStyleManager) {
          const groupStyles = topoViewerState.editorEngine.groupStyleManager.getGroupStyles();
          groupStyles.forEach((style: any) => {
            topoViewerState.editorEngine.groupStyleManager.applyStyleToNode(style.id);
          });
        }
      } else {
        const lm = topoViewerState.editorEngine?.layoutAlgoManager;
        if (lm?.isGeoMapInitialized) {
          const factor = lm.calculateGeoScale();
          lm.applyGeoScale(true, factor);
        }
      }

      const updatedElements = [...updatedNodes, ...updatedEdges];
      log.debug(`Updated Topology Data: ${JSON.stringify(updatedElements, null, 2)}`);

      // Determine the correct endpoint based on the mode
      const mode = (window as any).topoViewerMode;
      let endpoint: string;

      if (mode === 'view') {
        // View mode uses a single endpoint and doesn't support suppress notification
        endpoint = 'topo-viewport-save';
      } else {
        // Edit mode uses different endpoints based on suppressNotification
        endpoint = suppressNotification
          ? 'topo-editor-viewport-save-suppress-notification'
          : 'topo-editor-viewport-save';
      }

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
}