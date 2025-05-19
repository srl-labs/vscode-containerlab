/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests for the `addLabFolderToWorkspace` command.
 * The suite checks that a chosen lab folder is added to the VS Code workspace
 * using a stubbed `vscode` API from `test/helpers`.
 */
// These tests simulate adding a folder to the workspace without launching VS Code
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

// Replace the vscode module with our stub before importing the command
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { addLabFolderToWorkspace } from '../../../src/commands/addToWorkspace';
const vscodeStub = require('../../helpers/vscode-stub');

describe('addLabFolderToWorkspace command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastInfoMessage = '';
    vscodeStub.workspace.workspaceFolders = [];
    sinon.spy(vscodeStub.workspace, 'updateWorkspaceFolders');
    sinon.spy(vscodeStub.window, 'showInformationMessage');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('adds the folder to the workspace', async () => {
    const node = {
      labPath: { absolute: '/tmp/path/to/lab.clab.yaml' },
      label: 'lab1',
      name: 'lab1',
    } as any;
    await addLabFolderToWorkspace(node);

    const addSpy = (vscodeStub.workspace.updateWorkspaceFolders as sinon.SinonSpy);
    const msgSpy = (vscodeStub.window.showInformationMessage as sinon.SinonSpy);
    expect(addSpy.calledOnce).to.be.true;
    expect(addSpy.firstCall.args[2].uri.fsPath).to.equal('/tmp/path/to');
    expect(addSpy.firstCall.args[2].name).to.equal('lab1');
    expect(msgSpy.calledOnceWith('Added "lab1" to your workspace.')).to.be.true;
  });

  it('returns an error when labPath is missing', async () => {
    const result = await addLabFolderToWorkspace({ labPath: { absolute: '' } } as any);
    expect(result).to.be.an('error');
    expect((result as Error).message).to.equal('No lab path found for this lab');
    const addSpy = (vscodeStub.workspace.updateWorkspaceFolders as sinon.SinonSpy);
    expect(addSpy.notCalled).to.be.true;
  });
});
