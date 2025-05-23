/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Tests verifying that `stripAnsi` removes all ANSI escape sequences from a
 * string.
 *
 * The tests rely on stubbed VS Code APIs purely for compatibility so that
 * the helper can be executed in a plain Node environment.
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

import { stripAnsi } from '../../../src/utils';

describe('stripAnsi', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  // Should strip colour codes and other escapes from the string.
  it('removes ANSI escape sequences', () => {
    const colored = '\u001b[31mError\u001b[0m';
    const result = stripAnsi(colored);
    expect(result).to.equal('Error');
  });
});
