/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
/**
 * Unit tests for the addLabFolderToWorkspace command.
 * Ensures that a selected lab folder is properly added to the VS Code workspace.
 */
// Tests the addLabFolderToWorkspace command which adds a lab folder to the current workspace
import { expect } from 'chai';
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
  });

  it('adds the folder to the workspace', async () => {
    const node = {
      labPath: { absolute: '/tmp/path/to/lab.clab.yaml' },
      label: 'lab1',
      name: 'lab1',
    } as any;
    await addLabFolderToWorkspace(node);

    expect(vscodeStub.workspace.workspaceFolders).to.have.lengthOf(1);
    expect(vscodeStub.workspace.workspaceFolders[0].uri.fsPath).to.equal('/tmp/path/to');
    expect(vscodeStub.workspace.workspaceFolders[0].name).to.equal('lab1');
    expect(vscodeStub.window.lastInfoMessage).to.equal('Added "lab1" to your workspace.');
  });

  it('returns an error when labPath is missing', async () => {
    const result = await addLabFolderToWorkspace({ labPath: { absolute: '' } } as any);
    expect(result).to.be.an('error');
    expect((result as Error).message).to.equal('No lab path found for this lab');
    expect(vscodeStub.workspace.workspaceFolders).to.have.lengthOf(0);
  });
});
