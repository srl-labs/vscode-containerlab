/* eslint-env mocha */
/* global describe, it, after, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import * as fs from 'fs';
import { TopoViewerEditor } from '../../../src/topoViewerEditor/backend/topoViewerEditorWebUiFacade';
const vscodeStub = require('../../helpers/vscode-stub');

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.endsWith('commands/index')) {
    return path.join(__dirname, '..', '..', '..', 'src', 'commands', 'index.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

describe('validateYaml link endpoint check', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it('should fail when link references unknown node', async () => {
    const schemaPath = path.join(__dirname, '..', '..', '..', 'schema', 'clab.schema.json');
    const schemaContent = await fs.promises.readFile(schemaPath, 'utf8');
    const readFileStub = sinon.stub(vscodeStub.workspace.fs, 'readFile').resolves(new TextEncoder().encode(schemaContent));

    const context = { extensionUri: vscodeStub.Uri.file(path.join(__dirname, '..', '..', '..')), subscriptions: [] } as any;
    const editor = new TopoViewerEditor(context);

    const invalidYaml = `
name: test
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
  links:
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
`;

    const result = await (editor as any).validateYaml(invalidYaml);
    expect(result).to.be.false;

    readFileStub.restore();
  });
});
