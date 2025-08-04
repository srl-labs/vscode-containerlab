/* eslint-env mocha */
/* global describe, it, after, __dirname */
/**
 * Tests for `normalizeLabPath`.
 *
 * The suite creates temporary files and directories to verify how different
 * path inputs are resolved when the helper normalizes lab locations.  The
 * real filesystem is used along with a stubbed `vscode` module so behaviour
 * matches that of the extension.
 */
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
import { normalizeLabPath } from '../../../src/helpers/utils';
// Each test explains which aspect of path normalization is being verified. The
// actual file system is used where necessary so that calls to fs.existsSync and
// fs.realpathSync behave the same way they would in the extension.
describe('normalizeLabPath', () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });
  // 1) Empty input should simply return an empty string
  it('returns an empty string when given empty input', () => {
    const result = normalizeLabPath('');
    expect(result).to.equal('');
  });
  // 2) Paths beginning with "~" should expand to the current user's home dir
  it('expands ~ to the user\'s home directory', () => {
    // Create a temporary directory under the home directory
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), 'normalize-'));
    const expected = fs.realpathSync(tmpDir);
    const result = normalizeLabPath(`~/${path.basename(tmpDir)}`);
    expect(result).to.equal(expected);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  // 3) Relative paths must be resolved against the provided single-folder base
  it('resolves relative paths using the provided base directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'base-'));
    const filePath = path.join(base, 'lab.yml');
    fs.writeFileSync(filePath, '');

    const result = normalizeLabPath('lab.yml', base);
    expect(result).to.equal(fs.realpathSync(filePath));

    fs.rmSync(base, { recursive: true, force: true });
  });

  // 4) Absolute paths should be normalized using realpathSync
  it('returns the real absolute path when one is provided', () => {
    // Create a temporary file and resolve its real path
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abs-'));
    const absFile = path.join(tmpDir, 'lab.yml');
    fs.writeFileSync(absFile, '');

    const result = normalizeLabPath(absFile);
    expect(result).to.equal(fs.realpathSync(absFile));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5) If none of the candidate paths exist, return the first candidate
  it('falls back to the first candidate path when the file does not exist', () => {
    // Use a path that does not exist under a base directory
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-'));
    const expected = path.resolve(base, 'does-not-exist.yml');

    const result = normalizeLabPath('does-not-exist.yml', base);
    expect(result).to.equal(expected);

    fs.rmSync(base, { recursive: true, force: true });
  });
});