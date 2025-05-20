/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Unit tests for helper classes used by the tree view.
 *
 * These tests focus on the {@link ClabContainerTreeNode} getters that
 * return IPv4 and IPv6 addresses without their CIDR masks.  The getters
 * also normalise a value of `"N/A"` to an empty string.  By exercising all
 * branches we can ensure that the UI correctly displays node addresses.
 *
 * The suite stubs the `vscode` module so it can run in a plain Node
 * environment without the VS Code API available.
 */
import { expect } from 'chai';
import Module from 'module';
import path from 'path';

// The source files depend on the VS Code API.  To run the tests without the
// actual editor environment we replace Node's module resolution logic and point
// any import of `vscode` to a lightweight stub.
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { ClabContainerTreeNode } from '../../../src/treeView/common';
import { TreeItemCollapsibleState } from '../../helpers/vscode-stub';

describe('ClabContainerTreeNode getters', () => {
  after(() => {
    // Restore the original module resolver so subsequent tests use the
    // standard behaviour.
    (Module as any)._resolveFilename = originalResolve;
  });

  // When a CIDR is present the getter should strip it and return only
  // the IPv4 address.
  it('returns IPv4 address without mask', () => {
    const node = new ClabContainerTreeNode(
      'test',
      TreeItemCollapsibleState.None,
      'node1',
      'node1',
      'id',
      'running',
      'kind',
      'image',
      [],
      { absolute: '/abs/path', relative: 'path' },
      '10.0.0.1/24',
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(node.IPv4Address).to.equal('10.0.0.1');
  });

  // The getter returns an empty string if the address is reported as 'N/A'.
  it('returns empty string when IPv4 is N/A', () => {
    const node = new ClabContainerTreeNode(
      'test',
      TreeItemCollapsibleState.None,
      'node1',
      'node1',
      'id',
      'running',
      'kind',
      'image',
      [],
      { absolute: '/abs/path', relative: 'path' },
      'N/A',
    );
    expect(node.IPv4Address).to.equal('');
  });

  // The same stripping logic applies to IPv6 addresses as well.
  it('returns IPv6 address without mask', () => {
    const node = new ClabContainerTreeNode(
      'test',
      TreeItemCollapsibleState.None,
      'node1',
      'node1',
      'id',
      'running',
      'kind',
      'image',
      [],
      { absolute: '/abs/path', relative: 'path' },
      undefined,
      '2001:db8::1/64',
    );
    expect(node.IPv6Address).to.equal('2001:db8::1');
  });
});
