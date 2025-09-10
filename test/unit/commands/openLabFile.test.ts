/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests for the `openLabFile` command.
 *
 * The suite ensures that the correct topology file is opened via the
 * stubbed `vscode` API and that helpful errors are displayed when
 * required arguments are missing.
 */
// These tests run against a stubbed version of the VS Code API
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

import { openLabFile } from '../../../src/commands/openLabFile';
const vscodeStub = require('../../helpers/vscode-stub');

describe('openLabFile command', () => {
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

  // Opens the topology file in the current VS Code window.
  it('opens the lab file with vscode.open', () => {
    const node = { labPath: { absolute: '/home/user/lab.yml' } } as any;
    openLabFile(node);

    const spy = (vscodeStub.commands.executeCommand as sinon.SinonSpy);
    expect(spy.calledOnce).to.be.true;
    expect(spy.firstCall.args[0]).to.equal('vscode.open');
    expect(spy.firstCall.args[1].fsPath).to.equal('/home/user/lab.yml');
  });

  // Should show an error message when no node is provided.
  it('shows an error when node is undefined', () => {
    openLabFile(undefined as any);
    const spy = (vscodeStub.window.showErrorMessage as sinon.SinonSpy);
    expect(spy.calledOnceWith('No lab node selected.')).to.be.true;
  });

  // Should show an error if the selected node has no labPath.
  it('shows an error when labPath is missing', () => {
    openLabFile({ labPath: { absolute: '' } } as any);
    const spy = (vscodeStub.window.showErrorMessage as sinon.SinonSpy);
    expect(spy.calledOnceWith('No labPath found.')).to.be.true;
  });
});
