/* eslint-env node, mocha */
/* global describe, it, after, __dirname */
import { expect } from 'chai';
import Module from 'module';
import path from 'path';

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'vscode') {
    return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { FilterUtils } from '../../../src/helpers/filterUtils';

after(() => {
  // Restore the original module resolver so subsequent tests use the
  (Module as any)._resolveFilename = originalResolve;
});

describe('FilterUtils.createFilter - basic behavior', () => {
  it('returns always-true function for empty filter text', () => {
    const filter = FilterUtils.createFilter('');
    expect(filter('any string')).to.be.true;
    expect(filter('')).to.be.true;
    expect(filter('test123')).to.be.true;
  });

  it('returns always-true function for null/undefined filter text', () => {
    const filterNull = FilterUtils.createFilter(null as any);
    const filterUndefined = FilterUtils.createFilter(undefined as any);

    expect(filterNull('test')).to.be.true;
    expect(filterUndefined('test')).to.be.true;
  });

  it('handles partial string matching', () => {
    const filter = FilterUtils.createFilter('lab');

    expect(filter('contlabainer')).to.be.true;
    expect(filter('lab-test')).to.be.true;
    expect(filter('la_b')).to.be.false;
  });

  it('converts question mark wildcard to regex correctly', () => {
    const filter = FilterUtils.createFilter('test?');

    expect(filter('test1')).to.be.true;
    expect(filter('testa')).to.be.true;
    expect(filter('test-')).to.be.true;
    expect(filter('test')).to.be.false;
    expect(filter('test12')).to.be.false;
    expect(filter('testing')).to.be.false;
  });

  it('handles complex wildcard combinations', () => {
    const filter = FilterUtils.createFilter('test*#');

    expect(filter('test123')).to.be.true;
    expect(filter('test-case-1')).to.be.true;
    expect(filter('test')).to.be.false;
    expect(filter('test-case-')).to.be.false;
  });

  it('recognizes and handles regex patterns with backslashes', () => {
    const filter = FilterUtils.createFilter('test\\d+');

    expect(filter('test1')).to.be.true;
    expect(filter('test123')).to.be.true;
    expect(filter('test')).to.be.false;
  });

  it('recognizes and handles regex patterns with brackets', () => {
    const filter = FilterUtils.createFilter('test[0-9]+');

    expect(filter('test1')).to.be.true;
    expect(filter('test123')).to.be.true;
    expect(filter('test')).to.be.false;
    expect(filter('testa')).to.be.false;
  });

  it('recognizes and handles regex patterns with pipe', () => {
    const filter = FilterUtils.createFilter('node|container');

    expect(filter('node1')).to.be.true;
    expect(filter('container-lab')).to.be.true;
    expect(filter('my-node')).to.be.true;
    expect(filter('containerized')).to.be.true;
  });

  it('recognizes and handles regex patterns with anchors', () => {
    const filter = FilterUtils.createFilter('^test$');

    expect(filter('test')).to.be.true;
    expect(filter('testing')).to.be.false;
  });

  it('falls back to string matching for invalid regex patterns', () => {
    const filter = FilterUtils.createFilter('test[invalid');

    expect(filter('test[InValid')).to.be.true;
    expect(filter('my-test[invalid-case')).to.be.true;
    expect(filter('[invalid')).to.be.false;
  });
});

describe('FilterUtils.createFilter - advanced behavior', () => {
  it('handles special characters in string matching', () => {
    const filter = FilterUtils.createFilter('test.case');

    expect(filter('test.cAse')).to.be.true;
    expect(filter('my-test.case-example')).to.be.true;
    expect(filter('.ca')).to.be.false;
  });

  it('handles whitespace in filter patterns', () => {
    const filter = FilterUtils.createFilter('test case');

    expect(filter('TEST CASE')).to.be.true;
    expect(filter('my test case example')).to.be.true;
    expect(filter('testcase')).to.be.false;
  });

  it('handles unicode characters', () => {
    const filter = FilterUtils.createFilter('tëst');

    expect(filter('tëst')).to.be.true;
    expect(filter('TËST')).to.be.true;
    expect(filter('my-tëst-case')).to.be.true;
    expect(filter('test')).to.be.false;
  });

  it('matches file extensions with regex', () => {
    const filter = FilterUtils.createFilter('\\.(yml|yaml)$');

    expect(filter('topology.yml')).to.be.true;
    expect(filter('config.yaml')).to.be.true;
    expect(filter('yaml.json')).to.be.false;
    expect(filter('yamlfile')).to.be.false;
  });

  it('maintains case insensitivity across all matching types', () => {
    const stringFilter = FilterUtils.createFilter('TeSt');
    const wildcardFilter = FilterUtils.createFilter('TeSt*');
    const regexFilter = FilterUtils.createFilter('TeSt\\d+');

    expect(stringFilter('test')).to.be.true;
    expect(wildcardFilter('TEST456')).to.be.true;
    expect(regexFilter('test42')).to.be.true;
  });

  it('handles multiple consecutive wildcards', () => {
    const filter = FilterUtils.createFilter('test**?##');

    expect(filter('testabcd123')).to.be.true;
    expect(filter('test-case-456')).to.be.true;
    expect(filter('test')).to.be.false;
  });

  it('recognize .*gw02.* as existing regex and match correctly', () => {
    const filter = FilterUtils.createFilter('.*gw02.*');

    expect(filter('bs1-gw02')).to.be.true;
    expect(filter('test-gw02-lab')).to.be.true;
  });

  it('recognize .+gw02.+ as existing regex and match correctly', () => {
    // .+ requires at least one character after
    const filter = FilterUtils.createFilter('.+gw02.+');

    expect(filter('bs1-gw02')).to.be.false;
    expect(filter('gw02')).to.be.false;
    expect(filter('agw02b')).to.be.true;
  });

  it('handle regex patterns with word boundaries', () => {
    const filter = FilterUtils.createFilter('\\bgw02\\b');

    expect(filter('bs1-gw02')).to.be.true;
    expect(filter('gw020')).to.be.false;
    expect(filter('pgw02')).to.be.false;
  });

  it('handle complex regex with lookahead/lookbehind (if supported)', () => {
    const filter = FilterUtils.createFilter('.*gw(?=\\d{2}).*');

    expect(filter('test-gw01-lab')).to.be.true;
    expect(filter('bs1-gw2')).to.be.false;
    expect(filter('bs1-gw')).to.be.false;
  });
});

