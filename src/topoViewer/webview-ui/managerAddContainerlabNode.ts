// file: managerAddContainerlabNode.ts

import cytoscape from 'cytoscape';
import type { NodeData } from '../types/topoViewerGraph';
import topoViewerState from '../state';

/**
 * Adds new Containerlab nodes into the Cytoscape canvas.
 */
export class ManagerAddContainerlabNode {
  private static nodeCounter: number = 0;

  public viewportButtonsAddContainerlabNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject,
    template?: { kind: string; type?: string; image?: string; name?: string; icon?: string; baseName?: string }
  ): void {
    this.initializeNodeCounter(cy);
    const newNodeId = this.generateNodeId();
    const nodeName = this.generateNodeName(cy, newNodeId, template);
    const kind = template?.kind || window.defaultKind || 'nokia_srlinux';
    const newNodeData = this.createNodeData(newNodeId, nodeName, template, kind);
    const position = this.determinePosition(cy, event);

    cy.add({ group: 'nodes', data: newNodeData, position });
    this.applyGeoCoordinates(cy, newNodeId, position);
  }

  private initializeNodeCounter(cy: cytoscape.Core): void {
    if (ManagerAddContainerlabNode.nodeCounter !== 0) {
      return;
    }
    const existingNodeIds = cy.nodes().map(node => node.id());
    const maxId = existingNodeIds
      .filter(id => id.startsWith('nodeId-'))
      .map(id => parseInt(id.replace('nodeId-', ''), 10))
      .filter(num => !isNaN(num))
      .reduce((max, current) => Math.max(max, current), 0);
    ManagerAddContainerlabNode.nodeCounter = maxId;
  }

  private generateNodeId(): string {
    ManagerAddContainerlabNode.nodeCounter++;
    return `nodeId-${ManagerAddContainerlabNode.nodeCounter}`;
  }

  private generateNodeName(
    cy: cytoscape.Core,
    defaultName: string,
    template?: { baseName?: string }
  ): string {
    if (!template?.baseName) {
      return defaultName;
    }
    const existingNodeNames = cy.nodes().map(node => node.data('name'));
    let counter = 1;
    while (existingNodeNames.includes(`${template.baseName}${counter}`)) {
      counter++;
    }
    return `${template.baseName}${counter}`;
  }

  private createNodeData(
    newNodeId: string,
    nodeName: string,
    template: { kind: string; type?: string; image?: string; name?: string; icon?: string; baseName?: string } | undefined,
    kind: string
  ): NodeData {
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    const shouldIncludeType = nokiaKinds.includes(kind);
    const type = template ? template.type : window.defaultType || 'ixrd1';

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: nodeName,
      parent: '',
      topoViewerRole: template?.icon || 'pe',
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData: {
        kind,
        longname: '',
        image: template?.image || '',
        ...(shouldIncludeType && type ? { type } : {}),
        mgmtIpv4Address: '',
        fromCustomTemplate: template?.name ? true : false,
        ...(template &&
          Object.fromEntries(
            Object.entries(template).filter(([key]) =>
              !['name', 'kind', 'type', 'image', 'icon', 'setDefault', 'baseName'].includes(key)
            )
          ))
      }
    };

    const imageMap = window.imageMapping || {};
    const k = newNodeData.extraData?.kind || 'nokia_srlinux';
    newNodeData.extraData!.image = template?.image || imageMap[k] || '';
    return newNodeData;
  }

  private determinePosition(
    cy: cytoscape.Core,
    event: cytoscape.EventObject
  ): { x: number; y: number } {
    const extent = cy.extent();
    let position = event.position;

    if (
      !position ||
      position.x < extent.x1 ||
      position.x > extent.x2 ||
      position.y < extent.y1 ||
      position.y > extent.y2
    ) {
      const viewportCenterX = (extent.x1 + extent.x2) / 2;
      const viewportCenterY = (extent.y1 + extent.y2) / 2;
      const viewportWidth = extent.x2 - extent.x1;
      const viewportHeight = extent.y2 - extent.y1;
      const maxOffsetX = viewportWidth * 0.3;
      const maxOffsetY = viewportHeight * 0.3;
      position = {
        x: viewportCenterX + (Math.random() - 0.5) * maxOffsetX,
        y: viewportCenterY + (Math.random() - 0.5) * maxOffsetY
      };
    }

    return position;
  }

  private applyGeoCoordinates(
    cy: cytoscape.Core,
    newNodeId: string,
    position: { x: number; y: number }
  ): void {
    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
      const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
        x: position.x,
        y: position.y
      });
      const node = cy.getElementById(newNodeId);
      node.data('lat', latlng.lat.toString());
      node.data('lng', latlng.lng.toString());
    }
  }

  public viewportButtonsAddNetworkNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject
  ): void {
    const networkType = 'host';

    // Determine next available host interface number (eth1, eth2, ...)
    const existingNodeIds = cy.nodes().map(node => node.id());
    const hostRegex = new RegExp(`^${networkType}:eth(\\d+)$`);
    const usedNumbers = existingNodeIds
      .map(id => {
        const match = id.match(hostRegex);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);
    const nextInterface = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    const interfaceName = `eth${nextInterface}`;

    const newNodeId = `${networkType}:${interfaceName}`;

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: newNodeId,
      parent: '',
      topoViewerRole: 'cloud',
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData: {
        kind: networkType,
        longname: '',
        image: '',
        networkInterface: interfaceName // add this for future need
      }
    };

    const extent = cy.extent();
    let position = event.position;

    if (
      !position ||
      position.x < extent.x1 ||
      position.x > extent.x2 ||
      position.y < extent.y1 ||
      position.y > extent.y2
    ) {
      const viewportCenterX = (extent.x1 + extent.x2) / 2;
      const viewportCenterY = (extent.y1 + extent.y2) / 2;
      const viewportWidth = extent.x2 - extent.x1;
      const viewportHeight = extent.y2 - extent.y1;

      const maxOffsetX = viewportWidth * 0.3;
      const maxOffsetY = viewportHeight * 0.3;

      position = {
        x: viewportCenterX + (Math.random() - 0.5) * maxOffsetX,
        y: viewportCenterY + (Math.random() - 0.5) * maxOffsetY
      };
    }

    cy.add({ group: 'nodes', data: newNodeData, position });

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized && layoutMgr.cytoscapeLeafletMap) {
      const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
        x: position.x,
        y: position.y
      });
      const node = cy.getElementById(newNodeId);
      node.data('lat', latlng.lat.toString());
      node.data('lng', latlng.lng.toString());
    }
  }
}
