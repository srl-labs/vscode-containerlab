/* eslint-env mocha */
/* global describe, it, after, afterEach, __dirname */
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Module from 'module';
import * as YAML from 'yaml';

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

describe('saveViewport auto-compact kinds', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('creates linux kind for shared image and removes node images', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test.clab.yaml');
    const initial = `topology:\n  kinds:\n    nokia_srlinux:\n      image: ghcr.io/nokia/srlinux:24.10.1\n\n  nodes:\n    client1:\n      kind: linux\n      image: ghcr.io/srl-labs/network-multitool\n    client2:\n      kind: linux\n      image: ghcr.io/srl-labs/network-multitool\n    client3:\n      kind: linux\n      image: ghcr.io/srl-labs/network-multitool\n`;
    fs.writeFileSync(yamlPath, initial);

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      { group: 'nodes', data: { id: 'client1', name: 'client1', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/srl-labs/network-multitool' } } },
      { group: 'nodes', data: { id: 'client2', name: 'client2', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/srl-labs/network-multitool' } } },
      { group: 'nodes', data: { id: 'client3', name: 'client3', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/srl-labs/network-multitool' } } }
    ]);

    const doc = YAML.parseDocument(initial);
    await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor: { currentClabDoc: doc } as any });

    const result = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as any;
    expect(result.topology.kinds.linux.image).to.equal('ghcr.io/srl-labs/network-multitool:latest');
    expect(result.topology.nodes.client1).to.not.have.property('image');
    expect(result.topology.nodes.client2).to.not.have.property('image');
    expect(result.topology.nodes.client3).to.not.have.property('image');
  });

  it('keeps shared image but drops unique kind properties when overridden', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test2.clab.yaml');
    const initial = `topology:\n  defaults:\n    kind: nokia_srlinux\n  kinds:\n    nokia_srlinux:\n      image: ghcr.io/nokia/srlinux:24.10.1\n      type: ixrd2l\n    linux:\n      image: ghcr.io/srl-labs/network-multitool\n\n  nodes:\n    spine1:\n      kind: nokia_srlinux\n      type: ixrd3l\n    leaf1:\n      kind: nokia_srlinux\n    client1:\n      kind: linux\n      image: ghcr.io/srl-labs/network-multitool\n    client2:\n      kind: linux\n      image: ghcr.io/srl-labs/network-multitool\n    gnmic:\n      kind: linux\n      image: ghcr.io/openconfig/gnmic:0.39.1\n`;
    fs.writeFileSync(yamlPath, initial);

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      { group: 'nodes', data: { id: 'spine1', name: 'spine1', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux', type: 'ixrd3l' } } },
      { group: 'nodes', data: { id: 'leaf1', name: 'leaf1', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux' } } },
      { group: 'nodes', data: { id: 'client1', name: 'client1', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/srl-labs/network-multitool' } } },
      { group: 'nodes', data: { id: 'client2', name: 'client2', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/srl-labs/network-multitool' } } },
      { group: 'nodes', data: { id: 'gnmic', name: 'gnmic', topoViewerRole: 'node', extraData: { kind: 'linux', image: 'ghcr.io/openconfig/gnmic:0.39.1' } } }
    ]);

    const doc = YAML.parseDocument(initial);
    await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor: { currentClabDoc: doc } as any });

    const result = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as any;
    expect(result.topology.kinds.nokia_srlinux).to.not.have.property('type');
    expect(result.topology.kinds.linux.image).to.equal('ghcr.io/srl-labs/network-multitool:latest');
    expect(result.topology.nodes.client1).to.not.have.property('image');
    expect(result.topology.nodes.client2).to.not.have.property('image');
    expect(result.topology.nodes.gnmic.image).to.equal('ghcr.io/openconfig/gnmic:0.39.1');
  });

  it('demotes kind property when only one node retains it', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test3.clab.yaml');
    const initial = `topology:\n  kinds:\n    nokia_srlinux:\n      startup-config: configs/srl.cfg\n      image: ghcr.io/nokia/srlinux:latest\n      enforce-startup-config: true\n\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n    srl2:\n      kind: nokia_srlinux\n`;
    fs.writeFileSync(yamlPath, initial);

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      { group: 'nodes', data: { id: 'srl1', name: 'srl1', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux', 'enforce-startup-config': true } } },
      { group: 'nodes', data: { id: 'srl2', name: 'srl2', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux' } } }
    ]);

    const doc = YAML.parseDocument(initial);
    await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor: { currentClabDoc: doc } as any });

    const result = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as any;
    expect(result.topology.kinds.nokia_srlinux).to.not.have.property('enforce-startup-config');
    expect(result.topology.nodes.srl1['enforce-startup-config']).to.equal(true);
    expect(result.topology.nodes.srl2).to.not.have.property('enforce-startup-config');
  });

  it('removes kind property when no nodes retain it', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test4.clab.yaml');
    const initial = `topology:\n  kinds:\n    nokia_srlinux:\n      startup-config: configs/srl.cfg\n      image: ghcr.io/nokia/srlinux:latest\n      enforce-startup-config: true\n\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n    srl2:\n      kind: nokia_srlinux\n`;
    fs.writeFileSync(yamlPath, initial);

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      { group: 'nodes', data: { id: 'srl1', name: 'srl1', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux' } } },
      { group: 'nodes', data: { id: 'srl2', name: 'srl2', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux' } } }
    ]);

    const doc = YAML.parseDocument(initial);
    await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor: { currentClabDoc: doc } as any });

    const result = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as any;
    expect(result.topology.kinds.nokia_srlinux).to.not.have.property('enforce-startup-config');
    expect(result.topology.nodes.srl1).to.not.have.property('enforce-startup-config');
    expect(result.topology.nodes.srl2).to.not.have.property('enforce-startup-config');
  });

  it('demotes kind property when nodes differ on non-boolean values', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveViewport-'));
    const yamlPath = path.join(tmpDir, 'test5.clab.yaml');
    const initial = `topology:\n  kinds:\n    nokia_srlinux:\n      type: ixrd1\n      image: ghcr.io/nokia/srlinux:latest\n\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n    srl2:\n      kind: nokia_srlinux\n`;
    fs.writeFileSync(yamlPath, initial);

    sinon.stub(annotationsManager, 'loadAnnotations').resolves({
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
    });
    sinon.stub(annotationsManager, 'saveAnnotations').resolves();

    const payload = JSON.stringify([
      { group: 'nodes', data: { id: 'srl1', name: 'srl1', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux', type: 'ixrd1' } } },
      { group: 'nodes', data: { id: 'srl2', name: 'srl2', topoViewerRole: 'node', extraData: { kind: 'nokia_srlinux' } } }
    ]);

    const doc = YAML.parseDocument(initial);
    await saveViewport({ mode: 'edit', yamlFilePath: yamlPath, payload, adaptor: { currentClabDoc: doc } as any });

    const result = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) as any;
    expect(result.topology.kinds.nokia_srlinux).to.not.have.property('type');
    expect(result.topology.nodes.srl1.type).to.equal('ixrd1');
    expect(result.topology.nodes.srl2).to.not.have.property('type');
  });
});
