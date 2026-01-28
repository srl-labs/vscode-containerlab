/**
 * Field Deletion E2E Tests
 *
 * Tests that node editor fields are properly deleted from YAML when cleared.
 * Regression test for the bug where clearing labels/env/binds/etc would not
 * remove them from the YAML file.
 */
import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';
const SEL_APPLY_BTN = '[data-testid="node-editor"] [data-testid="panel-apply-btn"]';
const SEL_CLOSE_BTN = '[data-testid="node-editor"] [data-testid="panel-close-btn"]';
const SEL_DELETE_BTN = '[data-testid="node-editor"] .dynamic-delete-btn';

// Tab identifiers
const TAB = {
  BASIC: "basic",
  CONFIG: "config",
  RUNTIME: "runtime",
  NETWORK: "network",
  ADVANCED: "advanced"
} as const;

type TabName = (typeof TAB)[keyof typeof TAB];

const TEST_TOPOLOGY = "simple.clab.yml";

/**
 * Helper to reliably open node editor via double-click on a specific node
 */
async function openNodeEditorByNodeId(page: Page, nodeId: string, maxRetries = 3): Promise<void> {
  const editorPanel = page.locator(SEL_NODE_EDITOR);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
    const nodeBox = await nodeHandle.boundingBox();

    if (!nodeBox) {
      throw new Error(`Node ${nodeId} not found or has no bounding box`);
    }

    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(150);
    await page.mouse.dblclick(centerX, centerY);

    try {
      await expect(editorPanel).toBeVisible({ timeout: 2000 });
      return;
    } catch {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to open node editor after ${maxRetries} attempts for node ${nodeId}`
        );
      }
      await page.waitForTimeout(300);
    }
  }
}

/**
 * Helper to navigate to a specific tab in the node editor
 */
async function navigateToTab(page: Page, tabName: TabName): Promise<void> {
  const tab = page.locator(`[data-testid="panel-tab-${tabName}"]`);
  await tab.click();
  await page.waitForTimeout(200);
}

/**
 * Field Deletion Tests
 */
test.describe("Field Deletion from YAML", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
  });

  test("deleting labels removes them from YAML", async ({ page, topoViewerPage }) => {
    // Write a topology with labels already set
    const yamlWithLabels = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      labels:
        env: production
        team: network
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithLabels);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Verify initial YAML contains labels
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("labels:");
    expect(yamlContent).toContain("env: production");
    expect(yamlContent).toContain("team: network");

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    // Delete all labels by clicking the delete buttons
    // Find all delete buttons in the labels section and click them
    const deleteButtons = page.locator(SEL_DELETE_BTN);
    const count = await deleteButtons.count();

    // Delete labels from last to first to avoid index shifting
    for (let i = count - 1; i >= 0; i--) {
      await deleteButtons.nth(i).click();
      await page.waitForTimeout(100);
    }

    // Click Apply to save changes
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Verify YAML no longer contains labels for srl1
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    // The YAML should not have 'labels:' under srl1 anymore
    // Use a more specific check - labels should not appear in srl1's section
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("labels:");
    expect(srl1Section).not.toContain("env: production");
    expect(srl1Section).not.toContain("team: network");
  });

  test("deleting env variables removes them from YAML", async ({ page, topoViewerPage }) => {
    // Write a topology with env already set
    const yamlWithEnv = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      env:
        MY_VAR: value1
        ANOTHER_VAR: value2
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithEnv);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Verify initial YAML contains env
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("env:");
    expect(yamlContent).toContain("MY_VAR");

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    // Delete all env variables by clicking the delete buttons
    const deleteButtons = page.locator(SEL_DELETE_BTN);
    let count = await deleteButtons.count();

    // Delete from last to first
    while (count > 0) {
      await deleteButtons.nth(count - 1).click();
      await page.waitForTimeout(100);
      count = await deleteButtons.count();
    }

    // Click Apply to save changes
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Verify YAML no longer contains env for srl1
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("env:");
    expect(srl1Section).not.toContain("MY_VAR");
  });

  test("clearing string field removes it from YAML", async ({ page, topoViewerPage }) => {
    // Write a topology with user already set
    const yamlWithUser = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      user: testuser
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithUser);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Verify initial YAML contains user
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("user: testuser");

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    // Clear the user field
    const userField = page.locator("#node-user");
    await userField.clear();
    await userField.blur();
    await page.waitForTimeout(200);

    // Click Apply to save changes
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Verify YAML no longer contains user for srl1
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("user:");
  });

  test("deleting binds removes them from YAML", async ({ page, topoViewerPage }) => {
    // Write a topology with binds already set
    const yamlWithBinds = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      binds:
        - /host/path:/container/path
        - /another:/mount
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithBinds);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Verify initial YAML contains binds
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("binds:");

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    // Delete all binds by clicking the delete buttons
    const deleteButtons = page.locator(SEL_DELETE_BTN);
    let count = await deleteButtons.count();

    // Delete from last to first
    while (count > 0) {
      await deleteButtons.nth(count - 1).click();
      await page.waitForTimeout(100);
      count = await deleteButtons.count();
    }

    // Click Apply to save changes
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Verify YAML no longer contains binds for srl1
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("binds:");
  });

  test("clearing mgmt-ipv4 removes it from YAML", async ({ page, topoViewerPage }) => {
    // Write a topology with mgmt-ipv4 already set
    const yamlWithMgmt = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      mgmt-ipv4: 172.20.20.10
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithMgmt);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Verify initial YAML contains mgmt-ipv4
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("mgmt-ipv4: 172.20.20.10");

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.NETWORK);

    // Clear the mgmt-ipv4 field
    const mgmtField = page.locator("#node-mgmt-ipv4");
    await mgmtField.clear();
    await mgmtField.blur();
    await page.waitForTimeout(200);

    // Click Apply to save changes
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Verify YAML no longer contains mgmt-ipv4 for srl1
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("mgmt-ipv4:");
  });

  test("UI updates immediately after Apply without requiring reload", async ({
    page,
    topoViewerPage
  }) => {
    // Regression test: UI should reflect deleted fields immediately after Apply
    // without needing to close/reopen the editor or reload the page
    const yamlWithEnv = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      env:
        TEST_VAR: test_value
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithEnv);

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    // Verify initial UI shows the env var (should have exactly 1 delete button)
    const deleteButtons = page.locator(SEL_DELETE_BTN);
    await expect(deleteButtons).toHaveCount(1);

    // Delete the env var
    await deleteButtons.first().click();
    await page.waitForTimeout(100);

    // Verify delete button is gone after user action
    await expect(deleteButtons).toHaveCount(0);

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // KEY TEST: After Apply, the UI should STILL show 0 delete buttons
    // This is the regression test - previously the env var would reappear after Apply
    // because the form data wasn't being synced with the updated node data
    await expect(deleteButtons).toHaveCount(0);

    // Also verify YAML was properly updated
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("env:");
    expect(srl1Section).not.toContain("TEST_VAR");
  });

  test("unchecking auto-remove checkbox removes it from YAML", async ({ page, topoViewerPage }) => {
    // Test for boolean field deletion - user reported that unchecking doesn't delete from YAML
    const yamlWithAutoRemove = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      auto-remove: false
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithAutoRemove);

    // Verify initial YAML
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("auto-remove: false");

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    // Find the auto-remove checkbox
    const autoRemoveCheckbox = page.locator("#node-auto-remove");
    await expect(autoRemoveCheckbox).toBeVisible();

    // The checkbox should be unchecked (auto-remove: false in YAML)
    // We need to ensure the field is deleted when it's false (or unchecked)
    // The checkbox value doesn't matter - what matters is that when Apply is clicked,
    // the field should be removed from YAML since false is the default

    // Just click Apply without changing anything - the false value should be cleaned up
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Verify auto-remove was removed from YAML
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("auto-remove");
  });

  test("clearing startup-delay number field removes it from YAML", async ({
    page,
    topoViewerPage
  }) => {
    // Test for number field deletion
    const yamlWithDelay = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      startup-delay: 10
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithDelay);

    // Verify initial YAML
    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("startup-delay: 10");

    // Load the topology
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    // Open editor for srl1
    await openNodeEditorByNodeId(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    // Find and clear the startup-delay field
    const delayInput = page.locator("#node-startup-delay");
    await expect(delayInput).toBeVisible();
    await delayInput.click();
    await delayInput.fill("");
    await page.waitForTimeout(100);

    // Apply
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Verify startup-delay was removed from YAML
    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("startup-delay");
  });
});
