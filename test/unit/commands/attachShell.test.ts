/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests for the `attachShell` command.
 *
 * The suite validates the command string built for opening a shell
 * inside a container and ensures helpful errors appear when required
 * parameters are missing.  All VS Code and command modules are stubbed
 * so the tests can run in a plain Node environment.
 */
// The command interacts with a mocked terminal via helpers in `test/helpers`
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

// Replace modules with our stubs before importing the command
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.includes('utils')) {
    return path.join(__dirname, '..', '..', 'helpers', 'utils-stub.js');
  }
  if (request === './command' || request.includes('commands/command')) {
    return path.join(__dirname, '..', '..', 'helpers', 'command-stub.js');
  }
  if (request.includes('extension')) {
    return path.join(__dirname, '..', '..', 'helpers', 'extension-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { attachShell } from '../../../src/commands/attachShell';
const vscodeStub = require('../../helpers/vscode-stub');
const commandStub = require('../../helpers/command-stub');

describe('attachShell command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    commandStub.calls.length = 0;
    vscodeStub.window.lastErrorMessage = '';
    sinon.spy(commandStub, 'execCommandInTerminal');
    sinon.spy(vscodeStub.window, 'showErrorMessage');
    // Provide configuration values
    vscodeStub.workspace.getConfiguration = () => ({
      get: (key: string, defaultValue?: any) => {
        if (key === 'node.execCommandMapping') { return {}; }
        if (key === 'runtime') { return 'docker'; }
        if (key === 'sudoEnabledByDefault') { return false; }
        return defaultValue;
      }
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // Runs the docker exec command to attach when all parameters exist.
  it('attaches to a running shell session', () => {
    const node = { cID: 'abc123', kind: 'nokia_srlinux', name: 'srl1' } as any;
    attachShell(node);

    const spy = commandStub.execCommandInTerminal as sinon.SinonSpy;
    expect(spy.calledOnceWith('docker exec -it abc123 sr_cli', 'Shell - srl1')).to.be.true;
  });

  // Should show an error when the container ID is empty.
  it('shows an error when containerId is missing', () => {
    attachShell({ cID: '', kind: 'nokia_srlinux' } as any);
    const msgSpy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    const cmdSpy = commandStub.execCommandInTerminal as sinon.SinonSpy;
    expect(msgSpy.calledOnceWith('No containerId for shell attach.')).to.be.true;
    expect(cmdSpy.notCalled).to.be.true;
  });
});
