/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
/**
 * Unit tests for the attachShell command.
 * These tests verify that shell commands are constructed correctly and
 * errors are reported when required parameters are missing.
 */
// Tests the attachShell command which opens a shell inside a container
import { expect } from 'chai';
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

  it('attaches to a running shell session', () => {
    const node = { cID: 'abc123', kind: 'nokia_srlinux', label: 'srl1' } as any;
    attachShell(node);

    expect(commandStub.calls).to.have.lengthOf(1);
    expect(commandStub.calls[0].command).to.equal('docker exec -it abc123 sr_cli');
    expect(commandStub.calls[0].terminalName).to.equal('Shell - srl1');
  });

  it('shows an error when containerId is missing', () => {
    attachShell({ cID: '', kind: 'nokia_srlinux' } as any);
    expect(vscodeStub.window.lastErrorMessage).to.equal('No containerId for shell attach.');
    expect(commandStub.calls).to.have.lengthOf(0);
  });
});
