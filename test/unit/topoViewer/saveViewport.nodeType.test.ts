/* eslint-env mocha */
/* global describe, it, after, afterEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Module from 'module';
import YAML from 'yaml';

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

import { saveViewport } from '../../../src/topoViewer/extension/services/SaveViewport';
import { annotationsManager } from '../../../src/topoViewer/extension/services/AnnotationsFile';
import { TopoViewerAdaptorClab } from '../../../src/topoViewer/extension/services/TopologyAdapter';

describe('saveViewport node type preservation', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('preserves node type for non-nokia kinds', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-type-'));
    const yamlPath = path.join(tmpDir, 'test.clab.yaml');
    const yamlContent = `name: foo\ntopology:\n  defaults:\n    image: ciena_saos:10-11-01-0248\n    kind: linux\n  nodes:\n    router-1:\n      type: "5164"\n`;
    fs.writeFileSync(yamlPath, yamlContent);

    const adaptor = new TopoViewerAdaptorClab();
    adaptor.currentClabDoc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any) as YAML.Document.Parsed;
    adaptor.currentClabTopo = YAML.parse(yamlContent) as any;

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: []
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      {
        group: 'nodes',
        data: {
          id: 'router-1',
          name: 'router-1',
          topoViewerRole: 'pe',
          extraData: {
            kind: 'linux',
            image: 'ciena_saos:10-11-01-0248',
            type: '5164'
          }
        },
        position: { x: 0, y: 0 },
        parent: ''
      }
    ]);

    try {
      await saveViewport({
        mode: 'edit',
        yamlFilePath: yamlPath,
        payload,
        adaptor,
        setInternalUpdate: () => {}
      });
      const updatedYaml = fs.readFileSync(yamlPath, 'utf8');
      const parsed = YAML.parse(updatedYaml) as any;
      expect(parsed?.topology?.nodes?.['router-1']?.type).to.equal('5164');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('removes node type when cleared in the editor', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-type-clear-'));
    const yamlPath = path.join(tmpDir, 'test.clab.yaml');
    const yamlContent = `name: foo\ntopology:\n  defaults:\n    image: ciena_saos:10-11-01-0248\n    kind: linux\n  nodes:\n    router-1:\n      type: "5164"\n`;
    fs.writeFileSync(yamlPath, yamlContent);

    const adaptor = new TopoViewerAdaptorClab();
    adaptor.currentClabDoc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any) as YAML.Document.Parsed;
    adaptor.currentClabTopo = YAML.parse(yamlContent) as any;

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: []
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      {
        group: 'nodes',
        data: {
          id: 'router-1',
          name: 'router-1',
          topoViewerRole: 'pe',
          extraData: {
            kind: 'linux',
            image: 'ciena_saos:10-11-01-0248',
            type: ''
          }
        },
        position: { x: 0, y: 0 },
        parent: ''
      }
    ]);

    try {
      await saveViewport({
        mode: 'edit',
        yamlFilePath: yamlPath,
        payload,
        adaptor,
        setInternalUpdate: () => {}
      });
      const updatedYaml = fs.readFileSync(yamlPath, 'utf8');
      const parsed = YAML.parse(updatedYaml) as any;
      expect(parsed?.topology?.nodes?.['router-1']).to.not.have.property('type');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
