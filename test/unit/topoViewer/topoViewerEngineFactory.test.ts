/* eslint-env mocha */
/* global describe, it */
import { expect } from 'chai';
import { createCytoscapeInstance } from '../../../src/topoViewer/common/topoViewerEngineFactory';

describe('topoViewerEngineFactory', () => {
  it('creates cytoscape instance with custom options', () => {
    const cy = createCytoscapeInstance(undefined as any, { headless: true, wheelSensitivity: 2 });
    expect((cy as any).options().wheelSensitivity).to.equal(2);
  });
});
