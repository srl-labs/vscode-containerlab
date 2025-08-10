// file: managerAddContainerlabNode.ts

import cytoscape from 'cytoscape';
import type { NodeData } from '../../common/types/topoViewerGraph';
import topoViewerState from '../../common/webview-ui/state';

/**
 * Adds new Containerlab nodes into the Cytoscape canvas.
 */
export class ManagerAddContainerlabNode {
  public viewportButtonsAddContainerlabNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject
  ): void {
    const newNodeId = `nodeId-${cy.nodes().length + 1}`;

    const defaultKind = (window as any).defaultKind || 'nokia_srlinux';
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    const shouldIncludeType = nokiaKinds.includes(defaultKind);

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: newNodeId,
      parent: '',
      topoViewerRole: 'pe',
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData: {
        kind: defaultKind,
        longname: '',
        image: '',
        ...(shouldIncludeType && { type: (window as any).defaultType || 'ixrd1' }),
        mgmtIpv4Address: ''
      }
    };

    const imageMap = (window as any).imageMapping || {};
    const kind = newNodeData.extraData?.kind || 'nokia_srlinux';
    newNodeData.extraData!.image = imageMap[kind] || '';

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
      const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
      labels['graph-geoCoordinateLat'] = latlng.lat.toString();
      labels['graph-geoCoordinateLng'] = latlng.lng.toString();
      if (node.data('extraData')) {
        (node.data('extraData') as any).labels = labels;
      }
    }
  }
}