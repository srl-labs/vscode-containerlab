/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Unit tests for `LocalLabTreeDataProvider`.
 *
 * The provider scans the workspace for clab topology files and exposes them as
 * tree nodes. These tests stub the VS Code APIs so the provider can execute in
 * a plain Node.js environment. They assert that:
 *   1. When no topology files are discovered, the provider returns `undefined`
 *      and sets the `localLabsEmpty` context value.
 *   2. Running labs are filtered from the results and the remaining labs are
 *      returned alphabetically.
 */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

// Stub the vscode module before importing the provider
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.includes('utils')) {
    return path.join(__dirname, '..', '..', '..', 'src', 'helpers', 'utils.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { LocalLabTreeDataProvider } from '../../../src/treeView/localLabsProvider';
import * as ins from '../../../src/treeView/inspector';
const vscodeStub = require('../../helpers/vscode-stub');
const extension = require('../../../src/extension');

const LAB_B = '/workspace/b/lab2.clab.yaml';
const LAB_A = '/workspace/a/lab1.clab.yml';

describe('LocalLabTreeDataProvider', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.commands.executed.length = 0;
    vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace', path: '/workspace' } }];
    vscodeStub.workspace.createFileSystemWatcher = () => ({
      onDidCreate: () => {},
      onDidDelete: () => {},
      onDidChange: () => {},
    });
    vscodeStub.workspace.findFiles = async () => [];
    vscodeStub.EventEmitter = class { public event = () => {}; fire() {} } as any;
    delete require.cache[require.resolve('../../../src/helpers/utils')];
    try {
      delete require.cache[require.resolve('../../helpers/utils-stub')];
    } catch {
      /* ignore cleanup errors */
    }
    extension.favoriteLabs = new Set();
    extension.extensionContext = { globalState: { update: sinon.stub().resolves() } } as any;
    (ins as any).rawInspectData = [];
  });

  afterEach(() => {
    sinon.restore();
  });

  // When no topology files are present the provider should indicate an empty
  // lab list by returning `undefined` and setting `localLabsEmpty`.
  it('returns undefined when no labs are discovered', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([]);
    const provider = new LocalLabTreeDataProvider();
    const nodes = await provider.getChildren(undefined);
    expect(nodes).to.be.undefined;
    expect(vscodeStub.commands.executed).to.deep.include({
      command: 'setContext',
      args: ['localLabsEmpty', true],
    });
  });

  // Labs that are currently running should be filtered out and the remaining
  // entries returned in alphabetical order with `localLabsEmpty` set to false.
  it('filters running labs and sorts results', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([
      vscodeStub.Uri.file(LAB_B),
      vscodeStub.Uri.file(LAB_A),
    ]);
    (ins as any).rawInspectData = [
      { Labels: { 'clab-topo-file': LAB_B } },
    ];

    const provider = new LocalLabTreeDataProvider();
    const nodes = await provider.getChildren(undefined);

    expect(nodes).to.have.lengthOf(1);
    const folder = nodes![0];
    expect(folder.label).to.equal('a');
    const children = await provider.getChildren(folder as any);
    expect(children).to.have.lengthOf(1);
    const node = children![0];
    expect(node.label).to.equal('lab1.clab.yml');
    expect(node.labPath.absolute).to.equal(LAB_A);
    expect(node.description).to.equal('a');
    expect(vscodeStub.commands.executed).to.deep.include({
      command: 'setContext',
      args: ['localLabsEmpty', false],
    });
  });

  it('lists root-level labs before folders', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([
      vscodeStub.Uri.file('/workspace/root.clab.yml'),
      vscodeStub.Uri.file(LAB_A),
    ]);

    const provider = new LocalLabTreeDataProvider();
    const nodes = await provider.getChildren(undefined);

    expect(nodes).to.have.lengthOf(2);
    expect(nodes![0].label).to.equal('root.clab.yml');
    expect(nodes![1].label).to.equal('a');
  });

  it('places favorite labs first and keeps deploy context', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([
      vscodeStub.Uri.file(LAB_B),
      vscodeStub.Uri.file(LAB_A),
    ]);

    extension.favoriteLabs.add(LAB_B);

    const provider = new LocalLabTreeDataProvider();
    const nodes = await provider.getChildren(undefined);

    expect(nodes).to.have.lengthOf(2);
    const firstFolder = nodes![0];
    expect(firstFolder.label).to.equal('a');
    const secondFolder = nodes![1];
    expect(secondFolder.label).to.equal('b');
    const children = await provider.getChildren(secondFolder as any);
    expect(children![0].contextValue).to.equal('containerlabLabUndeployedFavorite');
    expect(children![0].favorite).to.be.true;
  });

  it('keeps favorites that no longer exist and displays them', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([]);
    sinon.stub(require('fs'), 'existsSync').returns(false);

    extension.favoriteLabs.add('/outside/lab.clab.yml');

    const provider = new LocalLabTreeDataProvider();
    const nodes = await provider.getChildren(undefined);

    expect(nodes).to.have.lengthOf(1);
    const favNode = nodes![0];
    expect(favNode.label).to.equal('lab.clab.yml');
    expect(favNode.favorite).to.be.true;
    expect(extension.favoriteLabs.size).to.equal(1);
    expect(vscodeStub.commands.executed).to.deep.include({
      command: 'setContext',
      args: ['localLabsEmpty', false],
    });
  });

  it('filters labs by folder name including nested paths', async () => {
    sinon.stub(vscodeStub.workspace, 'findFiles').resolves([
      vscodeStub.Uri.file('/workspace/a/nested/lab1.clab.yml'),
      vscodeStub.Uri.file('/workspace/b/lab2.clab.yml'),
    ]);

    const provider = new LocalLabTreeDataProvider();
    provider.setTreeFilter('nested');
    const rootNodes = await provider.getChildren(undefined);

    expect(rootNodes).to.have.lengthOf(1);
    const folderA = rootNodes![0];
    expect(folderA.label).to.equal('a');

    const nestedNodes = await provider.getChildren(folderA as any);
    expect(nestedNodes).to.have.lengthOf(1);
    const nestedFolder = nestedNodes![0];
    expect(nestedFolder.label).to.equal('nested');

    const labs = await provider.getChildren(nestedFolder as any);
    expect(labs).to.have.lengthOf(1);
    expect(labs![0].label).to.equal('lab1.clab.yml');
  });
});

