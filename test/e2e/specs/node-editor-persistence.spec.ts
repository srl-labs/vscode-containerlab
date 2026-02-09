import type { Page } from "@playwright/test";
import * as YAML from "yaml";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors - ContextPanel-based
const SEL_CONTEXT_PANEL = '[data-testid="context-panel"]';
const SEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';
const SEL_BACK_BTN = '[data-testid="panel-back-btn"]';

// Tab identifiers
const TAB = {
  BASIC: "basic",
  CONFIG: "config",
  RUNTIME: "runtime",
  NETWORK: "network",
  ADVANCED: "advanced"
} as const;

type TabName = (typeof TAB)[keyof typeof TAB];

// Test values
const TEST_KIND = "linux";
const TEST_USER = "testuser";
const TEST_TOPOLOGY = "simple.clab.yml";
const SEL_KIND_FIELD = "#node-kind";

/**
 * Click a node to open the editor in the ContextPanel (MUI design)
 */
async function clickNode(page: Page, nodeId: string): Promise<void> {
  const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
  await nodeHandle.scrollIntoViewIfNeeded();
  await expect(nodeHandle).toBeVisible({ timeout: 3000 });
  const box = await nodeHandle.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

/**
 * Wait for the node editor to appear in the ContextPanel
 */
async function waitForNodeEditor(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="panel-tab-basic"]')).toBeVisible({ timeout: 3000 });
}

/**
 * Navigate to a specific tab in the node editor
 */
async function navigateToTab(page: Page, tabName: TabName): Promise<void> {
  const tab = page.locator(`[data-testid="panel-tab-${tabName}"]`);
  await expect(tab).toBeVisible({ timeout: 2000 });
  await tab.click();
  await page.waitForTimeout(200);
}

/**
 * Fill an input field and blur to commit
 */
async function fillField(page: Page, fieldId: string, value: string): Promise<void> {
  const field = page.locator(`#${fieldId}`);
  await field.clear();
  await field.fill(value);
  await field.blur();
  await page.waitForTimeout(200);
}

async function selectMuiOption(page: Page, fieldId: string, optionName: string): Promise<void> {
  const select = page.locator(`#${fieldId}`);
  await expect(select).toBeVisible({ timeout: 3000 });
  await select.click({ force: true });
  const option = page.getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
  await page.waitForTimeout(200);
}

/**
 * Check a checkbox
 */
async function setCheckbox(page: Page, fieldId: string, checked: boolean): Promise<void> {
  const checkbox = page.locator(`#${fieldId}`);
  const isChecked = await checkbox.isChecked();
  if (isChecked !== checked) {
    await checkbox.click({ force: true });
  }
}

/**
 * Open node editor by clicking the node
 */
async function openNodeEditor(page: Page, nodeId: string): Promise<void> {
  await clickNode(page, nodeId);
  await waitForNodeEditor(page);
}

/**
 * Node Editor Persistence E2E Tests (MUI ContextPanel version)
 *
 * Tests that node editor changes are properly saved to YAML
 * and reflected after reopening the editor.
 */
test.describe("Node Editor Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
  });

  test("kind field persists after applying and reopening editor", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    // Open editor and change kind
    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain(`kind: ${TEST_KIND}`);

    // Close editor
    await page.locator(SEL_BACK_BTN).click();
    await page.waitForTimeout(300);

    // Reopen editor
    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.BASIC);

    // Verify kind is still set
    await expect(page.locator(SEL_KIND_FIELD)).toHaveValue(TEST_KIND);
  });

  test("startup-config field persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.CONFIG);
    await fillField(page, "node-startup-config", "/path/to/config.txt");

    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain("startup-config: /path/to/config.txt");
  });

  test("user field persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", TEST_USER);

    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain(`user: ${TEST_USER}`);
  });

  test("multiple fields persist after save", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);

    // Set multiple fields across tabs
    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);
    await fillField(page, "node-image", "alpine:latest");

    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", "root");

    await navigateToTab(page, TAB.NETWORK);
    await fillField(page, "node-mgmt-ipv4", "172.20.20.10");

    await navigateToTab(page, TAB.ADVANCED);
    await fillField(page, "node-memory", "512m");

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
        return (
          yaml.includes(`kind: ${TEST_KIND}`) &&
          yaml.includes("image: alpine:latest") &&
          yaml.includes("user: root") &&
          yaml.includes("mgmt-ipv4: 172.20.20.10") &&
          yaml.includes("memory: 512m")
        );
      }, { timeout: 5000 })
      .toBe(true);

    // Close and reopen editor to verify all fields
    await page.locator(SEL_BACK_BTN).click();
    await page.waitForTimeout(300);
    await openNodeEditor(page, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await expect(page.locator(SEL_KIND_FIELD)).toHaveValue(TEST_KIND);
    await expect(page.locator("#node-image")).toHaveValue("alpine:latest");

    await navigateToTab(page, TAB.RUNTIME);
    await expect(page.locator("#node-user")).toHaveValue("root");

    await navigateToTab(page, TAB.NETWORK);
    await expect(page.locator("#node-mgmt-ipv4")).toHaveValue("172.20.20.10");

    await navigateToTab(page, TAB.ADVANCED);
    await expect(page.locator("#node-memory")).toHaveValue("512m");
  });

  test("enforce-startup-config radio persists", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.CONFIG);

    // Click the "Enforce startup config" radio button (value="enforce")
    const enforceRadio = page.locator('input[type="radio"][value="enforce"]');
    await enforceRadio.click({ force: true });
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    await page.locator(SEL_BACK_BTN).click();
    await page.waitForTimeout(300);

    // Reopen and verify
    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.CONFIG);
    await expect(page.locator('input[type="radio"][value="enforce"]')).toBeChecked();

    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("enforce-startup-config: true");
  });

  test("restart-policy persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.RUNTIME);

    await selectMuiOption(page, "node-restart-policy", "Always");

    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(
        async () => {
          const yaml = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
          const parsed = YAML.parse(yaml) as any;
          return parsed?.topology?.nodes?.[nodeId]?.["restart-policy"] ?? null;
        },
        { timeout: 5000 }
      )
      .toBe("always");
  });

  test("network-mode persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.NETWORK);

    await selectMuiOption(page, "node-network-mode", "Host");

    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain("network-mode: host");
  });

  test("image-pull-policy persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);
    await navigateToTab(page, TAB.ADVANCED);

    await selectMuiOption(page, "node-image-pull-policy", "Always");

    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain("image-pull-policy: always");
  });

  test("values persist after page reload", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    await openNodeEditor(page, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);

    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", "admin");

    // Click Apply and close
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);
    await page.locator(SEL_BACK_BTN).click();
    await page.waitForTimeout(300);

    // Reload the page
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    // Verify node still exists
    const newNodeIds = await topoViewerPage.getNodeIds();
    expect(newNodeIds).toContain(nodeId);

    // Open editor and verify fields persisted
    await openNodeEditor(page, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await expect(page.locator(SEL_KIND_FIELD)).toHaveValue(TEST_KIND);

    await navigateToTab(page, TAB.RUNTIME);
    await expect(page.locator("#node-user")).toHaveValue("admin");
  });
});
