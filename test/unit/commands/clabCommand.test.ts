/* eslint-env mocha */
/* global describe, it, after, beforeEach, __dirname */
/**
 * Unit tests for the ClabCommand wrapper.
 * The suite checks command construction and error handling for various scenarios.
 */
import { expect } from 'chai';
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
    vscodeStub.workspace.getConfiguration = () => ({
      get: (key: string, def?: any) => {
        if (key === 'runtime') return 'docker';
        if (key === 'sudoEnabledByDefault') return false;
        return def;
      }
    });
  });

  it('constructs and executes command with node and flags', async () => {
    const node = new ClabLabTreeNode(
      'lab',
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: '/tmp/lab.yml', relative: 'lab.yml' }
    );
    const clab = new ClabCommand('deploy', node, undefined, true, 'term');
    await clab.run(['--foo']);

    expect(cmdStub.instances).to.have.lengthOf(1);
    const inst = cmdStub.instances[0];
    expect(inst.options.command).to.equal('containerlab');
    expect(inst.options.useSpinner).to.be.false;
    expect(inst.options.terminalName).to.equal('term');
    expect(inst.executedArgs).to.deep.equal([
      'deploy', '-r', 'docker', '--foo', '-t', '/tmp/lab.yml'
    ]);
  });

  it('shows an error when no node or editor provided', async () => {
    const clab = new ClabCommand('deploy', undefined as any);
    await clab.run();

    expect(vscodeStub.window.lastErrorMessage).to.equal('No lab node or topology file selected');
    expect(cmdStub.instances[0].executedArgs).to.be.undefined;
  });

  it('shows an error when labPath is missing', async () => {
    const node = new ClabLabTreeNode(
      'lab',
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: '', relative: '' }
    );
    const clab = new ClabCommand('destroy', node);
    await clab.run();

    expect(vscodeStub.window.lastErrorMessage).to.equal('No labPath found for command "destroy".');
    expect(cmdStub.instances[0].executedArgs).to.be.undefined;
  });
});
