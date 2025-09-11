/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';
import { CopyPasteManager } from '../../../src/topoViewer/webview-ui/managerCopyPaste';
import { ManagerGroupStyle } from '../../../src/topoViewer/webview-ui/managerGroupStyle';
import { ManagerFreeText } from '../../../src/topoViewer/webview-ui/managerFreeText';

(globalThis as any).window = globalThis;

describe('CopyPasteManager duplicate groups', () => {
  it('keeps label and generates sequential ids on paste', () => {
    const cy = cytoscape({ headless: true, elements: [
      { data: { id: 'test:1', name: 'test', label: 'test', topoViewerRole: 'group', extraData: {
        clabServerUsername: '', weight: '', name: '', topoViewerGroup: 'test', topoViewerGroupLevel: '1'
      } } }
    ]});
    const messageSender = { sendMessageToVscodeEndpointPost: async () => ({}) } as any;
    const groupStyle = new ManagerGroupStyle(cy, messageSender);
    const freeText = { addFreeTextAnnotation: () => {}, getAnnotations: () => [] } as unknown as ManagerFreeText;
    const mgr = new CopyPasteManager(cy, messageSender, groupStyle, freeText);

    const copyData = {
      elements: [
        { group: 'nodes', data: { id: 'test:1', name: 'test', label: 'test', topoViewerRole: 'group', extraData: {
          clabServerUsername: '', weight: '', name: '', topoViewerGroup: 'test', topoViewerGroupLevel: '1'
        } }, position: { x: 0, y: 0 } }
      ],
      annotations: { groupStyleAnnotations: [], freeTextAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] },
      originalCenter: { x: 0, y: 0 }
    };

    mgr.performPaste(copyData);

    const ids = cy.nodes().map(n => n.id());
    expect(ids).to.include('test:1');
    expect(ids).to.include('test:2');
    const newGroup = cy.getElementById('test:2');
    expect(newGroup.data('name')).to.equal('test');
    expect(newGroup.data('label')).to.equal('test');
  });
});
