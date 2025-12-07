// file: AddNodeManager.ts

import cytoscape from 'cytoscape';
import type { NodeData, NodeExtraData } from '../../../shared/types/topoViewerGraph';
import topoViewerState from '../../app/state';
import { getUniqueId } from '../../ui/IdUtils';
import { applyIconColorToNode } from '../canvas/BaseStyles';

type CustomNodeTemplate = {
  kind: string;
  type?: string;
  image?: string;
  name?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  baseName?: string;
  interfacePattern?: string;
};

/**
 * Adds new Containerlab nodes into the Cytoscape canvas.
 */
export class AddNodeManager {
  private static nodeCounter: number = 0;

  public viewportButtonsAddContainerlabNode(
    cy: cytoscape.Core,
    event: cytoscape.EventObject,
    template?: CustomNodeTemplate
  ): void {
    this.initializeNodeCounter(cy);
    const identifiers = this.resolveNodeIdentifiers(cy, template);
    const kind = template?.kind || window.defaultKind || 'nokia_srlinux';
    const newNodeData = this.createNodeData(identifiers.nodeId, identifiers.nodeName, template, kind);
    const position = this.determinePosition(cy, event);

    const createdNode = this.addNodeToCanvas(cy, newNodeData, position);
    this.applyTemplateIconStyles(createdNode, template);
    this.applyGeoCoordinates(cy, identifiers.nodeId, position);
  }

  private initializeNodeCounter(cy: cytoscape.Core): void {
    if (AddNodeManager.nodeCounter !== 0) {
      return;
    }
    const existingNodeIds = cy.nodes().map(node => node.id());
    const maxId = existingNodeIds
      .filter(id => id.startsWith('nodeId-'))
      .map(id => parseInt(id.replace('nodeId-', ''), 10))
      .filter(num => !isNaN(num))
      .reduce((max, current) => Math.max(max, current), 0);
    AddNodeManager.nodeCounter = maxId;
  }

  private generateNodeId(): string {
    AddNodeManager.nodeCounter++;
    return `nodeId-${AddNodeManager.nodeCounter}`;
  }

  private generateNodeName(
    cy: cytoscape.Core,
    defaultName: string,
    template?: { baseName?: string }
  ): string {
    if (!template?.baseName) {
      return defaultName;
    }
    const used = new Set<string>(cy.nodes().map(node => node.data('name')));
    return getUniqueId(template.baseName, used, false);
  }

  private createNodeData(
    newNodeId: string,
    nodeName: string,
    template: CustomNodeTemplate | undefined,
    kind: string
  ): NodeData {
    const extraData: NodeExtraData = {
      kind,
      longname: '',
      image: template?.image || '',
      mgmtIpv4Address: '',
      fromCustomTemplate: Boolean(template?.name),
      ...this.extractExtraTemplate(template)
    };

    const type = this.determineType(kind, template);
    if (type) {
      extraData.type = type;
    }

    const imageMap = window.imageMapping || {};
    const resolvedKind = extraData.kind || 'nokia_srlinux';
    if (!extraData.image) {
      extraData.image = imageMap[resolvedKind] || '';
    }

    return {
      id: newNodeId,
      editor: 'true',
      weight: '30',
      name: nodeName,
      parent: '',
      topoViewerRole: template?.icon || 'pe',
      iconColor: template?.iconColor,
      iconCornerRadius: template?.iconCornerRadius,
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData
    };
  }

  private determineType(
    kind: string,
    template?: { type?: string; name?: string }
  ): string | undefined {
    if (template?.type) {
      return template.type;
    }
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    if (!nokiaKinds.includes(kind)) {
      return undefined;
    }
    // If this template represents a custom node (has a name) but no explicit type,
    // avoid assigning a default type.
    if (template?.name) {
      return undefined;
    }
    return window.defaultType || 'ixr-d2l';
  }

  private extractExtraTemplate(
    template?: { [key: string]: unknown }
  ): Record<string, unknown> {
    if (!template) {
      return {};
    }
    const excluded = ['name', 'kind', 'type', 'image', 'icon', 'iconColor', 'iconCornerRadius', 'setDefault', 'baseName'];
    return Object.fromEntries(
      Object.entries(template).filter(([key]) => !excluded.includes(key))
    );
  }

  private resolveNodeIdentifiers(
    cy: cytoscape.Core,
    template?: { baseName?: string }
  ): { nodeId: string; nodeName: string } {
    const generatedId = this.generateNodeId();
    const nodeName = this.generateNodeName(cy, generatedId, template);
    const nodeId = nodeName || generatedId;
    return { nodeId, nodeName };
  }

  private addNodeToCanvas(
    cy: cytoscape.Core,
    data: NodeData,
    position: { x: number; y: number }
  ): cytoscape.NodeSingular | undefined {
    const collection = cy.add({ group: 'nodes', data, position });
    return collection[0];
  }

  private applyTemplateIconStyles(node: cytoscape.NodeSingular | undefined, template?: CustomNodeTemplate): void {
    if (!node || !template) return;
    const hasColor = typeof template.iconColor === 'string' && template.iconColor.trim() !== '';
    const hasRadius = typeof template.iconCornerRadius === 'number';
    const hasCustomIcon = this.hasCustomIcon(template.icon);
    if (!hasColor && !hasRadius && !hasCustomIcon) return;

    const options = hasRadius ? { cornerRadius: template.iconCornerRadius } : undefined;
    const preserveDefaultBackground = !hasColor && !hasCustomIcon;
    applyIconColorToNode(node, hasColor ? template.iconColor : undefined, options, preserveDefaultBackground);
  }

  private hasCustomIcon(iconName?: string | null): boolean {
    if (!iconName) {
      return false;
    }
    const customIcons = (window as any)?.customIcons;
    if (!customIcons || typeof customIcons !== 'object') {
      return false;
    }
    const iconData = customIcons[iconName];
    return typeof iconData === 'string' && iconData.length > 0;
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
      // Place near the center to avoid overlap without randomness
      position = {
        x: viewportCenterX + maxOffsetX * 0.1,
        y: viewportCenterY + maxOffsetY * 0.1
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
    event: cytoscape.EventObject,
    networkType: string = 'host'
  ): void {
    const { nodeId, nodeName, topoViewerRole, extraData } = this.generateNetworkNodeMetadata(
      cy,
      networkType
    );

    const newNodeData: NodeData = {
      id: nodeId,
      editor: 'true',
      weight: '30',
      name: nodeName,
      parent: '',
      topoViewerRole,
      sourceEndpoint: '',
      targetEndpoint: '',
      containerDockerExtraAttribute: { state: '', status: '' },
      extraData
    };

    const position = this.determinePosition(cy, event);
    cy.add({ group: 'nodes', data: newNodeData, position });
    this.applyGeoCoordinates(cy, nodeId, position);
  }

  private generateNetworkNodeMetadata(
    cy: cytoscape.Core,
    requestedType: string
  ): { nodeId: string; nodeName: string; topoViewerRole: string; extraData: NodeExtraData } {
    const type = (requestedType || 'host').toLowerCase();
    if (['host', 'mgmt-net', 'macvlan'].includes(type)) {
      return this.buildHostLikeNetworkNode(cy, type as 'host' | 'mgmt-net' | 'macvlan');
    }
    if (type === 'dummy') {
      return this.buildDummyNetworkNode(cy);
    }
    if (type === 'bridge' || type === 'ovs-bridge') {
      return this.buildBridgeNetworkNode(cy, type);
    }
    if (type === 'vxlan' || type === 'vxlan-stitch') {
      return this.buildVxlanNetworkNode(cy, type);
    }

    // Fallback to host network if the provided type is unsupported
    return this.buildHostLikeNetworkNode(cy, 'host');
  }

  private buildHostLikeNetworkNode(
    cy: cytoscape.Core,
    networkType: 'host' | 'mgmt-net' | 'macvlan'
  ): { nodeId: string; nodeName: string; topoViewerRole: string; extraData: NodeExtraData } {
    const existingNodeIds = cy.nodes().map(node => node.id());
    const hostRegex = new RegExp(`^${networkType}:eth(\\d+)$`);
    const usedNumbers = existingNodeIds
      .map(id => {
        const m = hostRegex.exec(id);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n): n is number => n !== null);
    const nextInterface = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    const interfaceName = `eth${nextInterface}`;
    const nodeId = `${networkType}:${interfaceName}`;

    const extraData: NodeExtraData = {
      kind: networkType,
      longname: '',
      image: '',
      networkInterface: interfaceName,
      extHostInterface: interfaceName
    };

    return {
      nodeId,
      nodeName: nodeId,
      topoViewerRole: 'cloud',
      extraData
    };
  }

  private buildDummyNetworkNode(
    cy: cytoscape.Core
  ): { nodeId: string; nodeName: string; topoViewerRole: string; extraData: NodeExtraData } {
    const existingIds = new Set(cy.nodes().map(node => node.id()));
    let counter = 1;
    while (existingIds.has(`dummy${counter}`)) {
      counter++;
    }
    const nodeId = `dummy${counter}`;
    const extraData: NodeExtraData = {
      kind: 'dummy',
      longname: '',
      image: ''
    };

    return {
      nodeId,
      nodeName: 'dummy',
      topoViewerRole: 'cloud',
      extraData
    };
  }

  private buildBridgeNetworkNode(
    cy: cytoscape.Core,
    networkType: 'bridge' | 'ovs-bridge'
  ): { nodeId: string; nodeName: string; topoViewerRole: string; extraData: NodeExtraData } {
    const existingIds = new Set(cy.nodes().map(node => node.id()));
    const baseName = networkType === 'bridge' ? 'bridge' : 'ovs-bridge';
    let counter = 1;
    let candidate = `${baseName}${counter}`;
    while (existingIds.has(candidate)) {
      counter++;
      candidate = `${baseName}${counter}`;
    }

    const extraData: NodeExtraData = {
      kind: networkType,
      longname: '',
      image: ''
    };

    return {
      nodeId: candidate,
      nodeName: candidate,
      topoViewerRole: 'bridge',
      extraData
    };
  }

  private buildVxlanNetworkNode(
    cy: cytoscape.Core,
    networkType: 'vxlan' | 'vxlan-stitch'
  ): { nodeId: string; nodeName: string; topoViewerRole: string; extraData: NodeExtraData } {
    const existingIds = cy.nodes().map(node => node.id());
    const vxlanRegex = new RegExp(`^${networkType}:auto(\\d+)-`);
    const usedNumbers = existingIds
      .map(id => {
        const m = vxlanRegex.exec(id);
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n): n is number => n !== null);
    const nextId = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;

    const remote = `remote${nextId}`;
    const vni = 1000 + nextId;
    const dstPort = 4789;
    const nodeId = `${networkType}:auto${nextId}-${remote}/${vni}/${dstPort}/`;

    const extraData: NodeExtraData = {
      kind: networkType,
      longname: '',
      image: '',
      extRemote: remote,
      extVni: vni,
      extDstPort: dstPort
    };

    return {
      nodeId,
      nodeName: nodeId,
      topoViewerRole: 'cloud',
      extraData
    };
  }
}
