/* eslint-env mocha, node */
/* global describe, it, global */
import { expect } from 'chai';
describe('cytoscapeInstanceFactory', () => {
  it('creates cytoscape instance with custom options', async () => {
    (global as any).window = {} as unknown;
    const { createConfiguredCytoscape } = await import('../../../src/topoViewer/cytoscapeInstanceFactory');
    const cy = createConfiguredCytoscape(undefined as any, { headless: true, wheelSensitivity: 2 });
    expect((cy as any).options().wheelSensitivity).to.equal(2);
  });
});
