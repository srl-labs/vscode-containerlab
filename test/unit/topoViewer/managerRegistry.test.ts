/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';

import {
  layoutAlgoManager,
  zoomToFitManager,
  labelEndpointManager,
  getGroupManager,
  getReloadTopoManager,
} from '../../../src/topoViewer/core/managerRegistry';
import {
  layoutAlgoManager as layoutAlgoManager2,
  zoomToFitManager as zoomToFitManager2,
  labelEndpointManager as labelEndpointManager2,
} from '../../../src/topoViewer/core/managerRegistry';
import { ManagerLayoutAlgo } from '../../../src/topoViewer/webview-ui/managerLayoutAlgo';
import { ManagerGroupManagement } from '../../../src/topoViewer/webview-ui/managerGroupManagement';
import { ManagerZoomToFit } from '../../../src/topoViewer/webview-ui/managerZoomToFit';
import { ManagerLabelEndpoint } from '../../../src/topoViewer/webview-ui/managerLabelEndpoint';
import { ManagerReloadTopo } from '../../../src/topoViewer/webview-ui/managerReloadTopo';
import { ManagerGroupStyle } from '../../../src/topoViewer/webview-ui/managerGroupStyle';

// Ensure window is defined for modules that expect it
(globalThis as any).window = globalThis;

describe('manager registry', () => {
  it('exports singleton layout manager', () => {
    expect(layoutAlgoManager).to.equal(layoutAlgoManager2);
    expect(layoutAlgoManager).to.be.instanceOf(ManagerLayoutAlgo);
  });

  it('provides singleton group manager', () => {
    const cy = cytoscape({ headless: true });
    const sender = { sendMessageToVscodeEndpointPost: async () => ({}) } as any;
    const gsm = new ManagerGroupStyle(cy, sender);
    const gm1 = getGroupManager(cy, gsm, 'view');
    const gm2 = getGroupManager(cy, gsm, 'edit');
    expect(gm1).to.equal(gm2);
    expect(gm1).to.be.instanceOf(ManagerGroupManagement);
  });

  it('exports singleton auxiliary managers', () => {
    expect(zoomToFitManager).to.equal(zoomToFitManager2);
    expect(zoomToFitManager).to.be.instanceOf(ManagerZoomToFit);

    expect(labelEndpointManager).to.equal(labelEndpointManager2);
    expect(labelEndpointManager).to.be.instanceOf(ManagerLabelEndpoint);

    const sender = { sendMessageToVscodeEndpointPost: async () => {} } as any;
    const r1 = getReloadTopoManager(sender);
    const r2 = getReloadTopoManager(sender);
    expect(r1).to.equal(r2);
    expect(r1).to.be.instanceOf(ManagerReloadTopo);
  });
});
