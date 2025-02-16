import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    // The extension ID is in the format <publisher>.<extensionName>
    const ext = vscode.extensions.getExtension('srl-labs.vscode-containerlab');
    assert.ok(ext, 'Extension is not present.');
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('srl-labs.vscode-containerlab');
    if (!ext) {
      throw new Error('Extension not found');
    }
    await ext.activate();
    assert.strictEqual(ext.isActive, true, 'Extension did not activate.');
  });
});
