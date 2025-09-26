/* eslint-env mocha */
/* global describe, it, after, afterEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.endsWith('logging/logger')) {
    return path.join(__dirname, '..', '..', 'helpers', 'extensionLogger-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { TopoViewerAdaptorClab } from '../../../src/topoViewer/core/topoViewerAdaptorClab';
import * as treeUtils from '../../../src/topoViewer/utilities/treeUtils';

after(() => {
  (Module as any)._resolveFilename = originalResolve;
});

afterEach(() => {
  sinon.restore();
});

describe('buildCytoscapeElements delegation', () => {
  it('delegates for both converter methods', async () => {
    const adaptor = new TopoViewerAdaptorClab();
    const spy = sinon.spy(adaptor as any, 'buildCytoscapeElements');
    sinon.stub(treeUtils, 'findContainerNode').returns({
      IPv4Address: '10.0.0.1',
      IPv6Address: '::1',
      state: 'running',
      interfaces: []
    } as any);

    const yaml = `\nname: demo\ntopology:\n  nodes:\n    node1: {}\n  links:\n    - endpoints: ['node1:eth0','node1:eth1']\n`;

    const withMgmt = await adaptor.clabYamlToCytoscapeElements(yaml, {});
    const withoutMgmt = await adaptor.clabYamlToCytoscapeElementsEditor(yaml);

    expect(spy.calledTwice).to.be.true;
    const nodeWith = withMgmt.find((e: any) => e.group === 'nodes');
    const nodeWithout = withoutMgmt.find((e: any) => e.group === 'nodes');
    expect(nodeWith?.data.extraData.mgmtIpv4Address).to.equal('10.0.0.1');
    expect(nodeWithout?.data.extraData.mgmtIpv4Address).to.equal('');
  });

  it('does not mark links as down when interface state is unknown', async () => {
    const adaptor = new TopoViewerAdaptorClab();

    const yaml = `\nname: demo\ntopology:\n  nodes:\n    node1: {}\n  links:\n    - endpoints: ['node1:eth0','node1:eth1']\n`;

    const elements = await adaptor.clabYamlToCytoscapeElementsEditor(yaml);
    const edge = elements.find((e: any) => e.group === 'edges');
    expect(edge?.classes).to.equal('');
  });

});

describe('dummy network visibility', () => {
  it('assigns unique ids to multiple dummy networks', async () => {
    const adaptor = new TopoViewerAdaptorClab();
    const yaml = `\nname: demo\ntopology:\n  nodes:\n    node1: {}\n  links:\n    - type: dummy\n      endpoint: node1:eth0\n    - type: dummy\n      endpoint: node1:eth1\n`;
    const elements = await adaptor.clabYamlToCytoscapeElementsEditor(yaml);
    const dummyNodes = elements.filter((e: any) => e.group === 'nodes' && e.data.id.startsWith('dummy'));
    expect(dummyNodes).to.have.length(2);
    expect(dummyNodes[0].data.name).to.equal('dummy');
    expect(dummyNodes[1].data.name).to.equal('dummy');
    expect(dummyNodes[0].data.id).to.not.equal(dummyNodes[1].data.id);
  });

  it('omits dummy links when hideDummyLinks option is enabled', async () => {
    const adaptor = new TopoViewerAdaptorClab();
    const yaml = `\nname: demo\ntopology:\n  nodes:\n    node1: {}\n  links:\n    - type: dummy\n      endpoint: node1:eth0\n    - type: dummy\n      endpoint: node1:eth1\n`;
    const elements = await adaptor.clabYamlToCytoscapeElementsEditor(yaml, undefined, { hideDummyLinks: true });
    const dummyNodes = elements.filter((e: any) => e.group === 'nodes' && e.data.id.startsWith('dummy'));
    const dummyEdges = elements.filter((e: any) => e.group === 'edges' && e.data.extraData?.extType === 'dummy');
    expect(dummyNodes).to.have.length(0);
    expect(dummyEdges).to.have.length(0);
  });
});
