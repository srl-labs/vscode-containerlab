/* eslint-env mocha, node */
/* global __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import { describe, it, afterEach } from 'mocha';

const originalResolve = (Module as any)._resolveFilename;
const extensionLoggerPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'topoViewer',
  'common',
  'logging',
  'extensionLogger'
);

describe('extensionLogger', () => {
  afterEach(() => {
    delete require.cache[require.resolve(extensionLoggerPath)];
    (Module as any)._resolveFilename = originalResolve;
    sinon.restore();
  });

  it('logs to VS Code output channel when available', () => {
    (Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
      if (request === 'vscode') {
        return path.join(__dirname, '..', '..', '..', '..', 'helpers', 'vscode-stub.js');
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    const vscodeStubPath = path.join(__dirname, '..', '..', '..', '..', 'helpers', 'vscode-stub.js');
    const vscodeStub = require(vscodeStubPath);
    const appendSpy = sinon.spy();
    vscodeStub.window.createOutputChannel = () => ({ appendLine: appendSpy });

    const { log } = require(extensionLoggerPath);
    log.info('hello');

    expect(appendSpy.calledOnce).to.be.true;
    const line = appendSpy.firstCall.args[0];
    expect(line).to.include('level=info');
    expect(line).to.include('msg=hello');
  });

  it('falls back to console when VS Code API is unavailable', () => {
    (Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
      if (request === 'vscode') {
        throw new Error('Cannot find module');
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    const consoleSpy = sinon.spy(console, 'log');
    const { log } = require(extensionLoggerPath);
    log.warn('hi');

    expect(consoleSpy.calledOnce).to.be.true;
    const line = consoleSpy.firstCall.args[0];
    expect(line).to.include('level=warn');
    expect(line).to.include('msg=hi');
  });
});
