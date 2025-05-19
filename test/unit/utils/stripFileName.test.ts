/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Unit tests for `stripFileName` ensuring only the directory portion remains.
 */
import { expect } from 'chai';
import Module from 'module';
import path from 'path';

// Stub the 'vscode' module before loading the utils
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { stripFileName } from '../../../src/utils';

describe('stripFileName', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it('removes the file name from a path', () => {
    const result = stripFileName('/path/to/file.txt');
    expect(result).to.equal('/path/to');
  });
});

