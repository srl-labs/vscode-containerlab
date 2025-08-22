/* eslint-env mocha, node */
/* global __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import { describe, it, afterEach } from 'mocha';

const originalResolve = (Module as any)._resolveFilename;
const loggerPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'topoViewer',
  'logging',
  'logger'
);

describe('logger (extension)', () => {
  afterEach(() => {
    delete require.cache[require.resolve(loggerPath)];
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
    const infoSpy = sinon.spy();
    vscodeStub.window.createOutputChannel = () => ({
      info: infoSpy,
      debug() {},
      warn() {},
      error() {}
    });

    const { log } = require(loggerPath);
    log.info('hello');

    expect(infoSpy.calledOnce).to.be.true;
    const line = infoSpy.firstCall.args[0];
    expect(line).to.include('hello');
  });

  it('falls back to console when VS Code API is unavailable', () => {
    (Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
      if (request === 'vscode') {
        throw new Error('Cannot find module');
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    const consoleSpy = sinon.spy(console, 'warn');
    const { log } = require(loggerPath);
    log.warn('hi');

    expect(consoleSpy.calledOnce).to.be.true;
    const line = consoleSpy.firstCall.args[0];
    expect(line).to.include('hi');
  });
});
