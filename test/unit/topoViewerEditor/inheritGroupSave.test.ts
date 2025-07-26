/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { TopoViewerEditor } from '../../../src/topoViewerEditor/backend/topoViewerEditorWebUiFacade';
const vscodeStub = require('../../helpers/vscode-stub');

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.endsWith('commands/index')) {
    return path.join(__dirname, '..', '..', '..', 'src', 'commands', 'index.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const sampleYaml = `
name: asd
topology:
  defaults:
    kind: nokia_srsim
    image: ghcr.io/nokia/srlinuxssss

  groups:
    spines:
      type: sr-1

  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      type: ixrd1
      labels:
        graph-posX: "65"
        graph-posY: "25"
        graph-icon: router
        graph-geoCoordinateLat: "49.329603962585516"
        graph-geoCoordinateLng: "9.731229905076532"
        graph-groupLabelPos: bottom-center
    srl2:
      group: spines
      labels:
        graph-posX: "165"
        graph-posY: "25"
        graph-icon: router
        graph-geoCoordinateLat: "48.964876032177635"
        graph-geoCoordinateLng: "9.481706542244165"
        graph-groupLabelPos: bottom-center
    nodeId-3:
      group: spines
      labels:
        graph-posX: "155"
        graph-posY: "105"
        graph-icon: pe
        graph-groupLabelPos: bottom-center
        graph-geoCoordinateLat: "49.868844033546026"
        graph-geoCoordinateLng: "10.086825736187491"

  links:
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
    - endpoints: [ nodeId-3:e1-1, srl2:e1-2 ]
`;

describe('TopoViewerEditor group inheritance save', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    sinon.restore();
    vscodeStub.workspace.createFileSystemWatcher = () => ({
      onDidChange: () => {},
      dispose: () => {},
    });
    vscodeStub.workspace.onDidSaveTextDocument = () => ({ dispose: () => {} });
  });

  it('omits inherited attributes when saving', async () => {
    sinon.stub(fs.promises, 'readFile').resolves(sampleYaml as any);
    sinon.stub(fs.promises, 'mkdir').resolves();

    let writtenYaml = '';
    sinon.stub(fs.promises, 'writeFile').callsFake(async (_p, data) => {
      writtenYaml = data as string;
    });

    let messageHandler: any = null;
    const panelStub = {
      webview: {
        asWebviewUri: (u: any) => u,
        html: '',
        postMessage: sinon.spy(),
        onDidReceiveMessage: (cb: any) => { messageHandler = cb; },
      },
      onDidDispose: () => {},
      reveal: () => {},
    };
    sinon.stub(vscodeStub.window, 'createWebviewPanel').returns(panelStub as any);

    const context = { extensionUri: vscodeStub.Uri.file('/ext'), subscriptions: [] } as any;
    const editor = new TopoViewerEditor(context);
    editor.lastYamlFilePath = '/tmp/test.clab.yml';

    sinon.stub((editor as any).adaptor, 'clabYamlToCytoscapeElements').returns([]);
    sinon.stub((editor as any).adaptor, 'generateStaticAssetUris').returns({ css: '', js: '', images: '' });
    sinon.stub((editor as any).adaptor, 'createFolderAndWriteJson').callsFake(async (...args: any[]) => {
      const yamlStr = args[3] as string;
      (editor as any).adaptor.currentClabDoc = YAML.parseDocument(yamlStr);
      return [] as any;
    });
    sinon.stub(editor as any, 'validateYaml').resolves(true);

    await editor.createWebviewPanel(context, vscodeStub.Uri.file('/tmp/test.clab.yml'), 'test');

    const payload = JSON.stringify([
      {
        group: 'nodes',
        data: {
          id: 'srl1',
          name: 'srl1',
          topoViewerRole: 'router',
          extraData: {
            group: '',
            kind: 'nokia_srlinux',
            image: 'ghcr.io/nokia/srlinux:latest',
            type: 'ixrd1',
            labels: {},
          },
        },
        position: { x: 65, y: 25 },
      },
      {
        group: 'nodes',
        data: {
          id: 'srl2',
          name: 'srl2',
          topoViewerRole: 'router',
          extraData: {
            group: 'spines',
            kind: 'nokia_srsim',
            image: 'ghcr.io/nokia/srlinuxssss',
            type: 'sr-1',
            labels: {},
          },
        },
        position: { x: 165, y: 25 },
      },
      {
        group: 'nodes',
        data: {
          id: 'nodeId-3',
          name: 'nodeId-3',
          topoViewerRole: 'pe',
          extraData: {
            group: 'spines',
            kind: 'nokia_srsim',
            image: 'ghcr.io/nokia/srlinuxssss',
            type: 'sr-1',
            labels: {},
          },
        },
        position: { x: 155, y: 105 },
      },
      { group: 'edges', data: { endpoints: ['srl1:e1-1', 'srl2:e1-1'] } },
      { group: 'edges', data: { endpoints: ['nodeId-3:e1-1', 'srl2:e1-2'] } },
    ]);
    if (messageHandler) {
      await messageHandler({ type: 'POST', requestId: '1', endpointName: 'topo-editor-viewport-save', payload });
    }

    const saved = YAML.parse(writtenYaml) as any;
    const n1 = saved.topology.nodes.srl1;
    const n2 = saved.topology.nodes.srl2;
    const n3 = saved.topology.nodes['nodeId-3'];

    expect(n1.group).to.equal(undefined);
    expect(n1.kind).to.equal('nokia_srlinux');
    expect(n1.image).to.equal('ghcr.io/nokia/srlinux:latest');
    expect(n1.type).to.equal('ixrd1');

    expect(n2.group).to.equal('spines');
    expect(n2.kind).to.equal(undefined);
    expect(n2.image).to.equal(undefined);
    expect(n2.type).to.equal(undefined);

    expect(n3.group).to.equal('spines');
    expect(n3.kind).to.equal(undefined);
    expect(n3.image).to.equal(undefined);
    expect(n3.type).to.equal(undefined);
  });
});