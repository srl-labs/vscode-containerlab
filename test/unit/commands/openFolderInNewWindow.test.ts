/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests for the `openFolderInNewWindow` command.
 * It checks that the selected lab folder is opened in a fresh VS Code window
 * using the stubbed `vscode` API.
 */
// The command simply invokes `vscode.openFolder` on the chosen folder path
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

import { openFolderInNewWindow } from '../../../src/commands/openFolderInNewWindow';
const vscodeStub = require('../../helpers/vscode-stub');

describe('openFolderInNewWindow command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastErrorMessage = '';
    vscodeStub.commands.executed = [];
    sinon.spy(vscodeStub.commands, 'executeCommand');
    sinon.spy(vscodeStub.window, 'showErrorMessage');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('opens the folder in a new window', async () => {
    const node = { labPath: { absolute: '/tmp/lab.yml' } } as any;
    await openFolderInNewWindow(node);

    const spy = (vscodeStub.commands.executeCommand as sinon.SinonSpy);
    expect(spy.calledOnce).to.be.true;
    expect(spy.firstCall.args[0]).to.equal('vscode.openFolder');
    expect(spy.firstCall.args[1].fsPath).to.equal('/tmp');
    expect(spy.firstCall.args[2]).to.deep.equal({ forceNewWindow: true });
  });

  it('shows an error when labPath is missing', async () => {
    await openFolderInNewWindow({ labPath: { absolute: '' } } as any);
    const spy = (vscodeStub.window.showErrorMessage as sinon.SinonSpy);
    expect(spy.calledOnceWith('No lab path found for this lab.')).to.be.true;
  });
});
