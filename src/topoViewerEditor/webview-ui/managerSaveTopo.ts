// file: managerSaveTopo.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeStyle';
import { VscodeMessageSender } from './managerVscodeWebview';

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
      console.log('viewportButtonsSaveTopo triggered');

      const layoutMgr = (window as any).topoViewerEditorEngine?.layoutAlgoManager;
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
        if (nodeJson.data?.extraData?.labels) {
          nodeJson.data.extraData.labels['graph-posX'] = posX.toString();
          nodeJson.data.extraData.labels['graph-posY'] = posY.toString();
        }

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
          nodeJson.data.extraData = nodeJson.data.extraData || {};
          nodeJson.data.extraData.labels = nodeJson.data.extraData.labels || {};
          nodeJson.data.extraData.labels['graph-geoCoordinateLat'] = nodeJson.data.lat;
          nodeJson.data.extraData.labels['graph-geoCoordinateLng'] = nodeJson.data.lng;
        } else if (nodeJson.data?.lat && nodeJson.data?.lng && nodeJson.data?.extraData?.labels) {
          nodeJson.data.extraData.labels['graph-geoCoordinateLat'] = nodeJson.data.lat;
          nodeJson.data.extraData.labels['graph-geoCoordinateLng'] = nodeJson.data.lng;
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

          if (
            typeof sourceEp === 'string' && sourceEp &&
            typeof targetEp === 'string' && targetEp
          ) {
            edgeJson.data.endpoints = [`${sourceId}:${sourceEp}`, `${targetId}:${targetEp}`];
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
      } else {
        const lm = (window as any).topoViewerEditorEngine?.layoutAlgoManager;
        if (lm?.isGeoMapInitialized) {
          const factor = lm.calculateGeoScale();
          lm.applyGeoScale(true, factor);
        }
      }

      const updatedElements = [...updatedNodes, ...updatedEdges];
      console.log('Updated Topology Data:', JSON.stringify(updatedElements, null, 2));

      if (!suppressNotification) {
        console.log('Not Suppressing notification for save action.');
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          'topo-editor-viewport-save-suppress-notification',
          updatedElements
        );
        console.log('Response from backend:', response);
      } else {
        const endpoint = suppressNotification
          ? 'topo-editor-viewport-save-suppress-notification'
          : 'topo-editor-viewport-save';

        console.log('Suppressing notification for save action.');
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          endpoint,
          updatedElements
        );
        console.log('Response from backend:', response);
      }
    } catch (err) {
      console.error('Backend call failed:', err);
    }
  }
}