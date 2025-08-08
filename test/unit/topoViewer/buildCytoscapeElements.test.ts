/* eslint-env mocha */
/* global describe, it, after, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { TopoViewerAdaptorClab } from '../../../src/topoViewer/backend/topoViewerAdaptorClab';
import * as treeUtils from '../../../src/topoViewer/backend/treeUtils';

describe('buildCytoscapeElements delegation', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it('delegates for both converter methods', () => {
    const adaptor = new TopoViewerAdaptorClab();
    const spy = sinon.spy(adaptor as any, 'buildCytoscapeElements');
    sinon.stub(treeUtils, 'findContainerNode').returns({
      IPv4Address: '10.0.0.1',
      IPv6Address: '::1',
      state: 'running',
      interfaces: []
    } as any);

    const yaml = `\nname: demo\ntopology:\n  nodes:\n    node1:\n      labels:\n        graph-posX: '1'\n        graph-posY: '2'\n  links:\n    - endpoints: ['node1:eth0','node1:eth1']\n`;

    const withMgmt = adaptor.clabYamlToCytoscapeElements(yaml, {});
    const withoutMgmt = adaptor.clabYamlToCytoscapeElementsEditor(yaml);

    expect(spy.calledTwice).to.be.true;
    const nodeWith = withMgmt.find(e => e.group === 'nodes');
    const nodeWithout = withoutMgmt.find(e => e.group === 'nodes');
    expect(nodeWith?.data.extraData.mgmtIpv4Address).to.equal('10.0.0.1');
    expect(nodeWithout?.data.extraData.mgmtIpv4Address).to.equal('');
  });
});
