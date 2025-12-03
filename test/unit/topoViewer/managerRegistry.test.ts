/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';

import {
  layoutAlgoManager,
  zoomToFitManager,
  labelEndpointManager,
  getGroupManager,
} from '../../../src/topoViewer/webview/core/managerRegistry';
import {
  layoutAlgoManager as layoutAlgoManager2,
  zoomToFitManager as zoomToFitManager2,
  labelEndpointManager as labelEndpointManager2,
} from '../../../src/topoViewer/webview/core/managerRegistry';
import { ManagerLayoutAlgo } from '../../../src/topoViewer/webview/features/canvas/LayoutAlgorithms';
import { ManagerGroupManagement } from '../../../src/topoViewer/webview/features/groups/GroupManager';
import { ManagerZoomToFit } from '../../../src/topoViewer/webview/features/canvas/ZoomToFit';
import { ManagerLabelEndpoint } from '../../../src/topoViewer/webview/features/canvas/LinkLabelManager';
import { ManagerGroupStyle } from '../../../src/topoViewer/webview/features/groups/GroupStyleManager';

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
  });
});
