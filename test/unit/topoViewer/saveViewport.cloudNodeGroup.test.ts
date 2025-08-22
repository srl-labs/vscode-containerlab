/* eslint-env mocha */
/* global describe, it, after, afterEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Module from 'module';

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  if (request.endsWith('logging/logger')) {
    return path.join(__dirname, '..', '..', 'helpers', 'extensionLogger-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { saveViewport } from '../../../src/topoViewer/utilities/saveViewport';
import { annotationsManager } from '../../../src/topoViewer/utilities/annotationsManager';

describe('saveViewport cloud node group handling', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('saves group and level for cloud nodes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test.clab.yaml');
    fs.writeFileSync(yamlPath, 'name: test\ntopology:\n  nodes: {}\n');

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: []
    });
    const saveStub = sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      {
        group: 'nodes',
        data: {
          id: 'host:eth1',
          topoViewerRole: 'cloud',
          name: 'host:eth1',
          extraData: { kind: 'host' }
        },
        position: { x: 10, y: 20 },
        parent: 'grp:1'
      }
    ]);

    await saveViewport({ mode: 'view', yamlFilePath: yamlPath, payload });

    expect(saveStub.calledOnce).to.be.true;
    const annotations = saveStub.firstCall.args[1] as any;
    expect(annotations.cloudNodeAnnotations).to.have.lengthOf(1);
    expect(annotations.cloudNodeAnnotations[0]).to.include({ id: 'host:eth1', group: 'grp', level: '1' });
  });
});
