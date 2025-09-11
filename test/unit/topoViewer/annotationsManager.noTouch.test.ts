/* eslint-env mocha */
/* global describe, it, after, __dirname */
import { expect } from 'chai';
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

import { annotationsManager } from '../../../src/topoViewer/utilities/annotationsManager';

describe('AnnotationsManager saveAnnotations', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it('does not rewrite file when annotations unchanged', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ann-'));
    const yamlPath = path.join(tmpDir, 'test.clab.yaml');
    fs.writeFileSync(yamlPath, 'name: test\n');
    const annPath = yamlPath + '.annotations.json';
    const data = {
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [{ id: 'n1', position: { x: 0, y: 0 } }]
    };
    fs.writeFileSync(annPath, JSON.stringify(data, null, 2));
    const before = fs.statSync(annPath).mtimeMs;

    await annotationsManager.saveAnnotations(yamlPath, data);

    const after = fs.statSync(annPath).mtimeMs;
    expect(after).to.equal(before);
  });
});
