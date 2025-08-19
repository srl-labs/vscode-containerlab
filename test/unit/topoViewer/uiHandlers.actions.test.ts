/* eslint-env mocha */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import cytoscape from 'cytoscape';

import topoViewerState from '../../../src/topoViewer/state';
import { nodeActionConnectToSSH, nodeActionAttachShell, nodeActionViewLogs, linkWireshark } from '../../../src/topoViewer/webview-ui/uiHandlers';

// Ensure window global for webview code
(globalThis as any).window = globalThis;

// Provide VS Code API stub
(globalThis as any).acquireVsCodeApi = () => ({ postMessage: () => {} });

describe('uiHandlers action endpoints', () => {
  let sendStub: sinon.SinonStub;

  beforeEach(() => {
    sendStub = sinon.stub().resolves(undefined);
    topoViewerState.editorEngine = { messageSender: { sendMessageToVscodeEndpointPost: sendStub } } as any;
    topoViewerState.selectedNode = null;
    topoViewerState.selectedEdge = null;
    topoViewerState.cy = null;
    topoViewerState.prefixName = 'clab';
    topoViewerState.labName = 'newlab';
  });

  afterEach(() => {
    topoViewerState.selectedNode = null;
    topoViewerState.selectedEdge = null;
    topoViewerState.cy = null;
    topoViewerState.editorEngine = undefined as any;
    topoViewerState.prefixName = 'clab';
    topoViewerState.labName = '';
  });

  it('nodeActionConnectToSSH posts to backend', async () => {
    topoViewerState.selectedNode = 'node1';
    await nodeActionConnectToSSH();
    expect(sendStub.calledOnceWithExactly('clab-node-connect-ssh', 'clab-newlab-node1')).to.be.true;
  });

  it('nodeActionAttachShell posts to backend', async () => {
    topoViewerState.selectedNode = 'node2';
    await nodeActionAttachShell();
    expect(sendStub.calledOnceWithExactly('clab-node-attach-shell', 'clab-newlab-node2')).to.be.true;
  });

  it('nodeActionViewLogs posts to backend', async () => {
    topoViewerState.selectedNode = 'node3';
    await nodeActionViewLogs();
    expect(sendStub.calledOnceWithExactly('clab-node-view-logs', 'clab-newlab-node3')).to.be.true;
  });

  it('uses bare node name when prefix is empty', async () => {
    topoViewerState.prefixName = '';
    topoViewerState.selectedNode = 'node4';
    await nodeActionConnectToSSH();
    expect(sendStub.calledOnceWithExactly('clab-node-connect-ssh', 'node4')).to.be.true;
  });

  it('builds container name with custom prefix', async () => {
    topoViewerState.prefixName = 'test';
    topoViewerState.selectedNode = 'node5';
    await nodeActionConnectToSSH();
    expect(sendStub.calledOnceWithExactly('clab-node-connect-ssh', 'test-newlab-node5')).to.be.true;
  });

  it('linkWireshark posts capture request', async () => {
    const cy = cytoscape({
      headless: true,
      elements: [
        { data: { id: 'a' } },
        { data: { id: 'b' } },
        {
          data: {
            id: 'e1',
            source: 'a',
            target: 'b',
            extraData: {
              clabSourceLongName: 'nodeA',
              clabSourcePort: 'eth0',
              clabTargetLongName: 'nodeB',
              clabTargetPort: 'eth1'
            }
          }
        }
      ]
    });
    topoViewerState.cy = cy as any;
    topoViewerState.selectedEdge = 'e1';

    await linkWireshark(new Event('click'), 'edgeSharkInterface', 'source', null);
    expect(sendStub.calledOnce).to.be.true;
    const [endpoint, payload] = sendStub.firstCall.args;
    expect(endpoint).to.equal('clab-link-capture');
    expect(payload).to.deep.equal({ nodeName: 'nodeA', interfaceName: 'eth0' });
  });

  it('linkWireshark posts VNC capture request', async () => {
    const cy = cytoscape({
      headless: true,
      elements: [
        { data: { id: 'a' } },
        { data: { id: 'b' } },
        {
          data: {
            id: 'e1',
            source: 'a',
            target: 'b',
            extraData: {
              clabSourceLongName: 'nodeA',
              clabSourcePort: 'eth0',
              clabTargetLongName: 'nodeB',
              clabTargetPort: 'eth1'
            }
          }
        }
      ]
    });
    topoViewerState.cy = cy as any;
    topoViewerState.selectedEdge = 'e1';

    await linkWireshark(new Event('click'), 'edgeSharkInterfaceVnc', 'target', null);
    expect(sendStub.calledOnce).to.be.true;
    const [endpoint, payload] = sendStub.firstCall.args;
    expect(endpoint).to.equal('clab-link-capture-edgeshark-vnc');
    expect(payload).to.deep.equal({ nodeName: 'nodeB', interfaceName: 'eth1' });
  });
});
