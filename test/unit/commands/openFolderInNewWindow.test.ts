/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
// Tests the openFolderInNewWindow command which opens a lab folder in a new VS Code window
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

import { openFolderInNewWindow } from '../../../src/commands/openFolderInNewWindow';
const vscodeStub = require('../../helpers/vscode-stub');

describe('openFolderInNewWindow command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastErrorMessage = '';
    vscodeStub.commands.executed = [];
  });

  it('opens the folder in a new window', async () => {
    const node = { labPath: { absolute: '/tmp/lab.yml' } } as any;
    await openFolderInNewWindow(node);

    expect(vscodeStub.commands.executed[0].command).to.equal('vscode.openFolder');
    expect(vscodeStub.commands.executed[0].args[0].fsPath).to.equal('/tmp');
    expect(vscodeStub.commands.executed[0].args[1]).to.deep.equal({ forceNewWindow: true });
  });

  it('shows an error when labPath is missing', async () => {
    await openFolderInNewWindow({ labPath: { absolute: '' } } as any);
    expect(vscodeStub.window.lastErrorMessage).to.equal('No lab path found for this lab.');
  });
});
