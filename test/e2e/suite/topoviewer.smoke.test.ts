import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

const EXTENSION_ID = "srl-labs.vscode-containerlab";
const WEBVIEW_VIEW_TYPE = "reactTopoViewer";

function assertEnvPath(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} must be set`);
  return value;
}

async function waitForWebviewTab(label: string): Promise<vscode.Tab> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label === label) {
          return tab;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const openTabs = vscode.window.tabGroups.all
    .flatMap((group) =>
      group.tabs.map((tab) => {
        const inputName =
          typeof tab.input === "object" && tab.input !== null
            ? tab.input.constructor.name
            : typeof tab.input;
        return `${tab.label}:${inputName}`;
      })
    )
    .join(", ");
  throw new Error(`Timed out waiting for ${WEBVIEW_VIEW_TYPE} tab "${label}". Open tabs: ${openTabs}`);
}

function assertBuiltWebviewAssets(extensionPath: string): void {
  const requiredAssets = [
    "reactTopoViewerWebview.js",
    "reactTopoViewerStyles.css",
    "maplibre-gl-csp-worker.js",
    "monaco-editor-worker.js",
    "monaco-json-worker.js",
    "monaco-yaml-worker.js"
  ];

  for (const asset of requiredAssets) {
    const assetPath = path.join(extensionPath, "dist", asset);
    assert.ok(fs.existsSync(assetPath), `Expected built webview asset: ${assetPath}`);
  }
}

suite("TopoViewer VS Code smoke", () => {
  test("opens a topology file in the packaged webview without throwing", async () => {
    const topologyPath = assertEnvPath("VSCODE_CONTAINERLAB_E2E_TOPOLOGY");
    assert.ok(fs.existsSync(topologyPath), `Expected topology fixture: ${topologyPath}`);

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Expected extension ${EXTENSION_ID} to be installed in test host`);

    await extension.activate();
    assertBuiltWebviewAssets(extension.extensionPath);

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(topologyPath));
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand("containerlab.lab.graph.topoViewer");
    const webviewTab = await waitForWebviewTab("smoke");
    assert.equal(webviewTab.isActive, true);

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(document.lineCount, 0), "# e2e-save-check\n");
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    assert.equal(await document.save(), true);
    assert.match(fs.readFileSync(topologyPath, "utf8"), /# e2e-save-check/);
  });
});
