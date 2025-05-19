/* eslint-env mocha */
/* global describe, it, after, __dirname */
// Unit tests for `normalizeLabPath` covering various path normalization scenarios.
// These tests create temporary files/directories as needed so that fs.existsSync
// returns true and realpathSync can operate correctly.
import { expect } from 'chai';
import Module from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
// Stub the 'vscode' module before loading the utils
const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
import { normalizeLabPath } from '../../../src/utils';
describe('normalizeLabPath', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });
  it('returns an empty string when given empty input', () => {
    const result = normalizeLabPath('');
    expect(result).to.equal('');
  });
  it('expands ~ to the user\'s home directory', () => {
    // Create a temporary directory under the home directory
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), 'normalize-'));
    const expected = fs.realpathSync(tmpDir);
    const result = normalizeLabPath(`~/${path.basename(tmpDir)}`);
    expect(result).to.equal(expected);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  it('resolves relative paths using the provided base directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    const filePath = path.join(base, 'lab.yml');
    fs.writeFileSync(filePath, '');

    const result = normalizeLabPath('lab.yml', base);
    expect(result).to.equal(fs.realpathSync(filePath));

    fs.rmSync(base, { recursive: true, force: true });
  });
});

