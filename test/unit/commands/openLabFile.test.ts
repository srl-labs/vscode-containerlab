/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
/**
 * Unit tests for the openLabFile command.
 * Verifies that the correct file is opened or that proper errors are shown.
 */
// Tests the openLabFile command which opens the selected lab in VS Code
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

import { openLabFile } from '../../../src/commands/openLabFile';
const vscodeStub = require('../../helpers/vscode-stub');

describe('openLabFile command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastErrorMessage = '';
    vscodeStub.commands.executed = [];
  });

  it('opens the lab file with vscode.open', () => {
    const node = { labPath: { absolute: '/tmp/lab.yml' } } as any;
    openLabFile(node);

    expect(vscodeStub.commands.executed[0].command).to.equal('vscode.open');
    expect(vscodeStub.commands.executed[0].args[0].fsPath).to.equal('/tmp/lab.yml');
  });

  it('shows an error when node is undefined', () => {
    openLabFile(undefined as any);
    expect(vscodeStub.window.lastErrorMessage).to.equal('No lab node selected.');
  });

  it('shows an error when labPath is missing', () => {
    openLabFile({ labPath: { absolute: '' } } as any);
    expect(vscodeStub.window.lastErrorMessage).to.equal('No labPath found.');
  });
});
