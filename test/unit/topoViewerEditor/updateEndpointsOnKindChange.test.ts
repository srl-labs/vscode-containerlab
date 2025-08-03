/* eslint-env mocha */
import { expect } from 'chai';
import { describe, it } from 'mocha';
import cytoscape from 'cytoscape';
import { ManagerViewportPanels } from '../../../src/topoViewerEditor/webview-ui/managerViewportPanels';

describe('updateNodeEndpointsForKindChange', () => {
  it('updates interface names when node kind changes', () => {
    (globalThis as any).document = { getElementById: () => null };
    (globalThis as any).window = {
      ifacePatternMapping: {
        nokia_srlinux: 'e2-{n}',
        nokia_srsim: '1/1/c1/{n}'
      }
    };

    const cy = cytoscape({ headless: true });
    const node1 = cy.add({ group: 'nodes', data: { id: 'node1', extraData: { kind: 'nokia_srlinux' } } });
    cy.add({ group: 'nodes', data: { id: 'node2', extraData: { kind: 'nokia_srlinux' } } });

    cy.add({ group: 'edges', data: { id: 'e1', source: 'node1', target: 'node2', sourceEndpoint: 'e2-1', targetEndpoint: 'e2-1' } });
    cy.add({ group: 'edges', data: { id: 'e2', source: 'node2', target: 'node1', sourceEndpoint: 'e2-2', targetEndpoint: 'e2-2' } });

    const manager = new ManagerViewportPanels({} as any, cy, {} as any);
    manager.updateNodeEndpointsForKindChange(node1, 'nokia_srlinux', 'nokia_srsim');

    const edge1 = cy.getElementById('e1');
    const edge2 = cy.getElementById('e2');
    expect(edge1.data('sourceEndpoint')).to.equal('1/1/c1/1');
    expect(edge1.data('targetEndpoint')).to.equal('e2-1');
    expect(edge2.data('targetEndpoint')).to.equal('1/1/c1/2');
    expect(edge2.data('sourceEndpoint')).to.equal('e2-2');

    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });
});