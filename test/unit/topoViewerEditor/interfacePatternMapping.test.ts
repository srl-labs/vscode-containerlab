/* eslint-env mocha */
/* global describe, it, after, afterEach, __dirname */
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

import { TopoViewerEditor } from '../../../src/topoViewerEditor/backend/topoViewerEditorWebUiFacade';
const vscodeStub = require('../../helpers/vscode-stub');

describe('TopoViewerEditor getInterfacePatternMapping', () => {
  const originalGetConfig = vscodeStub.workspace.getConfiguration;
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });
  afterEach(() => {
    vscodeStub.workspace.getConfiguration = originalGetConfig;
  });

  it('includes node mapping when editor mapping missing', () => {
    vscodeStub.workspace.getConfiguration = (section: string) => {
      if (section === 'containerlab.node') {
        return {
          get: (key: string, def?: any) =>
            key === 'interfacePatternMapping' ? { nokia_srsim: '1/1/c1/{n}' } : def,
        };
      }
      if (section === 'containerlab.editor') {
        return {
          get: (key: string, def?: any) =>
            key === 'interfacePatternMapping' ? {} : def,
        };
      }
      return { get: (_: string, def?: any) => def };
    };

    const editor = new TopoViewerEditor({} as any);
    const mapping = (editor as any).getInterfacePatternMapping();
    expect(mapping).to.deep.equal({ nokia_srsim: '1/1/c1/{n}' });
  });

  it('editor mapping overrides node mapping', () => {
    vscodeStub.workspace.getConfiguration = (section: string) => {
      if (section === 'containerlab.node') {
        return {
          get: (key: string, def?: any) =>
            key === 'interfacePatternMapping' ? { nokia_srlinux: 'foo-{n}' } : def,
        };
      }
      if (section === 'containerlab.editor') {
        return {
          get: (key: string, def?: any) =>
            key === 'interfacePatternMapping' ? { nokia_srlinux: 'bar-{n}' } : def,
        };
      }
      return { get: (_: string, def?: any) => def };
    };

    const editor = new TopoViewerEditor({} as any);
    const mapping = (editor as any).getInterfacePatternMapping();
    expect(mapping.nokia_srlinux).to.equal('bar-{n}');
  });
});