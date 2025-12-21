/* eslint-env mocha */
/* global describe, it, before, after, beforeEach, afterEach */
import Module from 'module';
import path from 'path';

import { expect } from 'chai';
import sinon from 'sinon';

describe('refreshSshxSessions', () => {
  const originalResolve = (Module as any)._resolveFilename;
  let refreshSshxSessions: () => Promise<void>;
  let sshxSessions: Map<string, string>;
  let utilsStub: any;
  let vscodeStub: any;
  let extension: any;

  // Helper to clear module cache for all vscode-containerlab modules
  function clearModuleCache() {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('vscode-containerlab') && !key.includes('node_modules')) {
        delete require.cache[key];
      }
    });
  }

  before(() => {
    // Clear any previously cached modules
    clearModuleCache();

    // Set up module resolution intercepts
    (Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
      if (request === 'vscode') {
        return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
      }
      if (request.includes('utils') && !request.includes('stub')) {
        return path.join(__dirname, '..', '..', 'helpers', 'utils-stub.js');
      }
      if (request === 'dockerode') {
        return path.join(__dirname, '..', '..', 'helpers', 'dockerode-stub.js');
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    // Now require the modules fresh
    vscodeStub = require('../../helpers/vscode-stub');
    utilsStub = require('../../helpers/utils-stub');
    extension = require('../../../src/extension');
    refreshSshxSessions = extension.refreshSshxSessions;
    sshxSessions = extension.sshxSessions;
  });

  after(() => {
    (Module as any)._resolveFilename = originalResolve;
    clearModuleCache();
  });

  beforeEach(() => {
    utilsStub.calls.length = 0;
    utilsStub.setOutput('');
    sshxSessions.clear();
    (extension as any).outputChannel = vscodeStub.window.createOutputChannel('test', { log: true });
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
