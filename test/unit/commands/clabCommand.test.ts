/* eslint-env mocha */
/* global describe, it, after, beforeEach, afterEach, __dirname */
/**
 * Tests covering the `ClabCommand` helper class.
 *
 * The suite verifies how commands are constructed and how errors are
 * surfaced in different situations using stubbed dependencies.  The
 * `vscode` module and the internal `Command` implementation are replaced
 * so the tests can run outside of the editor environment.
 */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Patch require cache for the Command module to use a stub
const commandPath = require.resolve('../../../src/commands/command');
(require.cache as any)[commandPath] = { exports: require("../../helpers/command-class-stub.js") } as any;
import { ClabCommand } from '../../../src/commands/clabCommand';
import { ClabLabTreeNode } from '../../../src/treeView/common';
const vscodeStub = require('../../helpers/vscode-stub');
const cmdStub = require('../../helpers/command-class-stub');


describe('ClabCommand', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    cmdStub.instances.length = 0;
    vscodeStub.window.lastErrorMessage = '';
    vscodeStub.window.activeTextEditor = undefined;
    sinon.spy(cmdStub.Command.prototype, 'execute');
    sinon.spy(vscodeStub.window, 'showErrorMessage');
    vscodeStub.workspace.getConfiguration = () => ({
      get: (key: string, def?: any) => {
        if (key === 'runtime') return 'docker';
        if (key === 'sudoEnabledByDefault') return false;
        return def;
      }
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // Executes the command when a node and flags are provided.
  it('constructs and executes command with node and flags', async () => {
    const node = new ClabLabTreeNode(
      'lab',
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: '/tmp/lab.yml', relative: 'lab.yml' }
    );
    const clab = new ClabCommand('deploy', node);
    await clab.run(['--foo']);

    expect(cmdStub.instances).to.have.lengthOf(1);
    const inst = cmdStub.instances[0];
    expect(inst.options.command).to.equal('containerlab');
    expect(inst.options.useSpinner).to.be.true;
    expect(inst.options.terminalName).to.equal('term');

    const execSpy = cmdStub.Command.prototype.execute as sinon.SinonSpy;
    expect(execSpy.calledOnce).to.be.true;
    expect(execSpy.firstCall.args[0]).to.deep.equal([
      'deploy', '-r', 'docker', '--foo', '-t', '/tmp/lab.yml'
    ]);
  });

  // Should report an error if neither a node nor an active editor is present.
  it('shows an error when no node or editor provided', async () => {
    const clab = new ClabCommand('deploy', undefined as any);
    await clab.run();

    const execSpy = cmdStub.Command.prototype.execute as sinon.SinonSpy;
    const msgSpy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(msgSpy.calledOnceWith('No lab node or topology file selected')).to.be.true;
    expect(execSpy.notCalled).to.be.true;
  });

  // Should report an error when the labPath property is empty.
  it('shows an error when labPath is missing', async () => {
    const node = new ClabLabTreeNode(
      'lab',
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: '', relative: '' }
    );
    const clab = new ClabCommand('destroy', node);
    await clab.run();

    const execSpy = cmdStub.Command.prototype.execute as sinon.SinonSpy;
    const msgSpy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(msgSpy.calledOnceWith('No labPath found for command "destroy".')).to.be.true;
    expect(execSpy.notCalled).to.be.true;
  });
});
