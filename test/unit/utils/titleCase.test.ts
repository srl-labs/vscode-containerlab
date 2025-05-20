/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Tests for the `titleCase` helper which capitalizes the first character of a
 * string.
 *
 * The helper is executed with the `vscode` module stubbed so the test can
 * run independently of the editor environment.
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

  // Should uppercase only the first letter of the string.
  it('capitalizes the first character', () => {
    const result = titleCase('hello');
    expect(result).to.equal('Hello');
  });
});

