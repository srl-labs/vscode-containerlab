/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Unit tests for `titleCase` ensuring that the initial character is capitalized.
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

import { titleCase } from '../../../src/utils';

describe('titleCase', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it('capitalizes the first character', () => {
    const result = titleCase('hello');
    expect(result).to.equal('Hello');
  });
});

