/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests for the `deploy` command.
 * The suite verifies that a `ClabCommand` instance receives the expected
 * arguments when deploying a topology.
 */
// These tests use stubs to emulate VS Code and containerlab CLI behaviour
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

// Replace the vscode module and ClabCommand with stubs before importing the command
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.includes('clabCommand')) {
    return path.join(__dirname, '..', '..', 'helpers', 'clabCommand-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { deploy } from '../../../src/commands/deploy';
const clabStub = require('../../helpers/clabCommand-stub');

describe('deploy command', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    clabStub.instances.length = 0;
    sinon.spy(clabStub.ClabCommand.prototype, 'run');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates ClabCommand and runs it', () => {
    const node = { labPath: { absolute: '/tmp/lab.yml' } } as any;
    deploy(node);

    expect(clabStub.instances.length).to.equal(1);
    const instance = clabStub.instances[0];
    expect(instance.action).to.equal('deploy');
    expect(instance.node).to.equal(node);
    expect(instance.spinnerMessages.progressMsg).to.equal('Deploying Lab... ');
    expect(instance.spinnerMessages.successMsg).to.equal('Lab deployed successfully!');

    const spy = clabStub.ClabCommand.prototype.run as sinon.SinonSpy;
    expect(spy.calledOnceWithExactly()).to.be.true;
    expect(instance.runArgs).to.be.undefined;
  });
});
