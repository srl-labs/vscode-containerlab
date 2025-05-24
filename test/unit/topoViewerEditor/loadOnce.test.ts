/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import * as fs from 'fs';

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

import { TopoViewerEditor } from '../../../src/topoViewerEditor/backend/topoViewerEditorWebUiFacade';
const vscodeStub = require('../../helpers/vscode-stub');
// Provide a default implementation so sinon can stub it later
vscodeStub.window.createWebviewPanel = () => ({
  webview: {
    asWebviewUri: (u: any) => u,
    html: '',
  },
  onDidDispose: () => {},
  reveal: () => {},
});

const sampleYaml = `\nname: test\ntopology:\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n`;

describe('TopoViewerEditor initial load', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    sinon.restore();
    vscodeStub.workspace.createFileSystemWatcher = () => ({
      onDidChange: () => {},
      dispose: () => {},
    });
  });

  it('should load topology only once', async () => {
    sinon.stub(fs.promises, 'readFile').resolves(sampleYaml as any);
    sinon.stub(fs.promises, 'writeFile').resolves();
    sinon.stub(fs.promises, 'mkdir').resolves();

    let watcherCallback: any = null;
    vscodeStub.workspace.createFileSystemWatcher = () => ({
      onDidChange: (cb: any) => {
        watcherCallback = cb;
      },
      dispose: () => {},
    });

    const panelStub = {
      webview: {
        asWebviewUri: (u: any) => u,
        html: '',
        onDidReceiveMessage: () => {},
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
    sinon.stub((editor as any).adaptor, 'createFolderAndWriteJson').resolves([] as any);
    sinon.stub(editor as any, 'validateYaml').resolves(true);

    const updateSpy = sinon.spy(editor, 'updatePanelHtml');

    await editor.createWebviewPanel(context, vscodeStub.Uri.file('/tmp/test.clab.yml'), 'test');

    if (watcherCallback) {
      (editor as any).isInternalUpdate = true;
      watcherCallback(vscodeStub.Uri.file('/tmp/test.clab.yml'));
      watcherCallback(vscodeStub.Uri.file('/tmp/test.clab.yml'));
      (editor as any).isInternalUpdate = false;
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    expect(updateSpy.callCount).to.equal(1);
  });
});
