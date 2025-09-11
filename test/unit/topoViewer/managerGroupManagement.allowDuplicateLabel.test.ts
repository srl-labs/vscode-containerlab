/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../../../src/topoViewer/webview-ui/managerGroupManagement';
import { ManagerGroupStyle } from '../../../src/topoViewer/webview-ui/managerGroupStyle';

(globalThis as any).window = globalThis;

describe('ManagerGroupManagement duplicate group labels', () => {
  it('allows creating groups with identical labels by generating unique ids', async () => {
    const cy = cytoscape({ headless: true, elements: [
      { data: { id: 'group1:1', name: 'group1', topoViewerRole: 'group', extraData: {
        clabServerUsername: '', weight: '', name: '', topoViewerGroup: 'group1', topoViewerGroupLevel: '1'
      } } },
      { data: { id: 'group2:1', name: 'group2', topoViewerRole: 'group', extraData: {
        clabServerUsername: '', weight: '', name: '', topoViewerGroup: 'group2', topoViewerGroupLevel: '1'
      } } }
    ]});
    const messageSender = { sendMessageToVscodeEndpointPost: async () => ({}) } as any;
    const styleManager = new ManagerGroupStyle(cy, messageSender);
    const mgr = new ManagerGroupManagement(cy, styleManager, 'edit');

    const elements: Record<string, any> = {
      'panel-node-editor-parent-graph-group-id': { textContent: 'group2:1' },
      'panel-node-editor-parent-graph-group': { value: 'group1' },
      'panel-node-editor-parent-graph-level': { value: '1' },
      'panel-node-editor-parent-label-dropdown-button-text': { textContent: 'top-center' },
      'panel-node-editor-parent-bg-color': { value: '#d9d9d9' },
      'panel-node-editor-parent-border-color': { value: '#DDDDDD' },
      'panel-node-editor-parent-border-width': { value: '0.5' },
      'panel-node-editor-parent-text-color': { value: '#EBECF0' }
    };
    (globalThis as any).document = { getElementById: (id: string) => elements[id] } as any;
    (globalThis as any).sendMessageToVscodeEndpointPost = async () => {};

    await mgr.nodeParentPropertiesUpdate();

    const ids = cy.nodes().map(n => n.id());
    expect(ids).to.include('group1:1');
    expect(ids).to.include('group1:2');
    const group1Nodes = cy.nodes().filter(n => n.data('name') === 'group1');
    expect(group1Nodes.length).to.equal(2);
  });
});
