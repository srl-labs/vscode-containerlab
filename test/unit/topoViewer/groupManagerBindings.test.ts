/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../../../src/topoViewer/common/webview-ui/managerGroupManagement';

// ensure window is available for global assignments
(globalThis as any).window = globalThis;

describe('group manager global bindings', () => {
  it('exposes nodeParentPropertiesUpdate on window and updates label class', async () => {
    const cy = cytoscape({ headless: true, elements: [
      { data: { id: 'group1:1', name: 'group1', topoViewerRole: 'group', extraData: {
        clabServerUsername: '', weight: '', name: '', topoViewerGroup: 'group1', topoViewerGroupLevel: '1'
      } } }
    ] });

    const mgr = new ManagerGroupManagement(cy, 'edit');
    (window as any).nodeParentPropertiesUpdate = mgr.nodeParentPropertiesUpdate.bind(mgr);

    const elements: Record<string, any> = {
      'panel-node-editor-parent-graph-group-id': { textContent: 'group1:1' },
      'panel-node-editor-parent-graph-group': { value: 'group1' },
      'panel-node-editor-parent-graph-level': { value: '1' },
      'panel-node-editor-parent-label-dropdown-button-text': { textContent: 'top-center' }
    };
    (globalThis as any).document = { getElementById: (id: string) => elements[id] } as any;
    (globalThis as any).acquireVsCodeApi = () => ({ window: { showWarningMessage: () => {} } });
    (globalThis as any).sendMessageToVscodeEndpointPost = async () => {};

    expect(typeof (window as any).nodeParentPropertiesUpdate).to.equal('function');
    await (window as any).nodeParentPropertiesUpdate();
    expect(cy.getElementById('group1:1').hasClass('top-center')).to.be.true;
  });
});
