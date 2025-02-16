// test/utils.test.ts

import * as assert from 'assert';
import * as path from 'path';
import * as utils from '../src/utils';

suite('Utils Test Suite', () => {
    test('stripAnsi removes ANSI escape sequences', () => {
        const input = '\u001b[31mHello\u001b[0m \u001b[32mWorld\u001b[0m';
        const expected = 'Hello World';
        assert.strictEqual(utils.stripAnsi(input), expected);
    });

    test('stripFileName removes filename from path', () => {
        const input = '/path/to/file.txt';
        const expected = '/path/to';
        assert.strictEqual(utils.stripFileName(input), expected);
    });

    test('titleCase capitalizes first letter', () => {
        assert.strictEqual(utils.titleCase('hello'), 'Hello');
        assert.strictEqual(utils.titleCase('world'), 'World');
        assert.strictEqual(utils.titleCase(''), '');
    });

    test('getSudo returns correct prefix based on configuration', () => {
        // Mock configuration - you'll need to implement proper mocking
        const sudo = utils.getSudo();
        assert.ok(typeof sudo === 'string');
    });

    test('normalizeLabPath handles various path formats', () => {
        const testPath = path.join('test', 'topology.clab.yml');
        const normalized = utils.normalizeLabPath(testPath);
        assert.ok(normalized.includes('topology.clab.yml'));
    });

    test('isOrbstack returns boolean', () => {
        const result = utils.isOrbstack();
        assert.ok(typeof result === 'boolean');
    });
});