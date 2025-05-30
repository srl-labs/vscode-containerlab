/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

// Stub vscode and containerlab utils before importing the module
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.includes('helpers/containerlabUtils')) {
    return path.join(__dirname, '..', '..', 'helpers', 'containerlabUtils-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import * as extension from '../../../src/extension';
const { refreshSshxSessions, sshxSessions } = extension;
const utilsStub = require('../../helpers/containerlabUtils-stub.js');
const vscodeStub = require('../../helpers/vscode-stub');

describe('refreshSshxSessions', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    utilsStub.calls.length = 0;
    utilsStub.setOutput('');
    sshxSessions.clear();
    (extension as any).outputChannel = vscodeStub.window.createOutputChannel();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('parses sessions from container name when network lacks prefix', async () => {
    const sample = JSON.stringify([
      {
        "name": "clab-atest-sshx",
        "network": "clab",
        "state": "running",
        "ipv4_address": "172.20.20.4",
        "link": "https://sshx.io/s/QfCkbDXUnk#FINGn1xZar19RC",
        "owner": "tester"
      },
      {
        "name": "sshx-clab",
        "network": "clab",
        "state": "exited",
        "ipv4_address": "",
        "link": "N/A",
        "owner": "tester"
      }
    ]);
    utilsStub.setOutput(sample);
    await refreshSshxSessions();
    expect(utilsStub.calls[0]).to.contain('containerlab tools sshx list -f json');
    expect(sshxSessions.size).to.equal(1);
    expect(sshxSessions.get('atest')).to.equal('https://sshx.io/s/QfCkbDXUnk#FINGn1xZar19RC');
  });
});
