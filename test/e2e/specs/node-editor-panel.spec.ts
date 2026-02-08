import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors for the new MUI ContextPanel-based editor
const SEL_PANEL_TITLE = '[data-testid="panel-title"]';
const SEL_PANEL_TAB_BASIC = '[data-testid="panel-tab-basic"]';
const SEL_PANEL_CLOSE_BTN = '[data-testid="panel-close-btn"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';
const SEL_PANEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';

const TITLE_NODE_EDITOR = "Node Editor";
const ATTR_ARIA_SELECTED = "aria-selected";
const ARIA_SELECTED_TRUE = "true";
const ARIA_SELECTED_FALSE = "false";

/**
 * Click on a node element in the canvas to trigger the editor.
 * In edit mode, clicking a node calls editNode() which opens the Node Editor in the ContextPanel.
 */
async function clickNode(page: Page, nodeId: string) {
  const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
  await nodeHandle.scrollIntoViewIfNeeded();
  await expect(nodeHandle).toBeVisible({ timeout: 3000 });
  const box = await nodeHandle.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

/**
 * Node Editor Panel E2E Tests (MUI ContextPanel version)
 *
 * In the new MUI design, the node editor opens in the ContextPanel sidebar
 * when a node is clicked in edit mode (calling editNode internally).
 */
test.describe("Node Editor Panel", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
  });

  test("opens node editor panel on click", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).toHaveText(TITLE_NODE_EDITOR);
  });

  test("node editor panel has correct title", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const title = page.locator(SEL_PANEL_TITLE);
    await expect(title).toBeVisible();
    await expect(title).toHaveText(TITLE_NODE_EDITOR);
  });

  test("node editor panel has Basic tab selected by default", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const basicTab = page.locator(SEL_PANEL_TAB_BASIC);
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_SELECTED_TRUE);
  });

  test("can navigate between tabs in node editor", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    // Click on Configuration tab
    const configTab = page.locator('[data-testid="panel-tab-config"]');
    await expect(configTab).toBeVisible();
    await configTab.click();
    await page.waitForTimeout(200);

    await expect(configTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_SELECTED_TRUE);

    const basicTab = page.locator(SEL_PANEL_TAB_BASIC);
    await expect(basicTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_SELECTED_FALSE);
  });

  test("node editor panel has all expected tabs", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const tabs = ["basic", "config", "runtime", "network", "advanced"];
    for (const tabId of tabs) {
      const tab = page.locator(`[data-testid="panel-tab-${tabId}"]`);
      await expect(tab).toBeVisible();
    }
  });

  test("closes node editor panel with close button", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();

    const closeBtn = page.locator(SEL_PANEL_CLOSE_BTN);
    await closeBtn.click();
    await page.waitForTimeout(300);

    await expect(panelTitle).not.toBeVisible();
  });

  test("closes node editor panel with OK button", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).toHaveText(TITLE_NODE_EDITOR);

    // Prefer keyboard activation to avoid dev-only overlay intercepting pointer events.
    const okBtn = page.locator(SEL_PANEL_OK_BTN);
    await okBtn.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // OK returns the context panel back to palette view, which hides the header/title entirely.
    await expect(panelTitle).not.toBeVisible();
    await expect(page.getByPlaceholder("Search nodes...")).toBeVisible();
  });

  test("node editor panel does not open in view mode", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setViewMode();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    // In view mode, selection shows Node Properties rather than an editor.
    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).not.toHaveText(TITLE_NODE_EDITOR);
    await expect(panelTitle).toHaveText("Node Properties");
  });

  test("node editor opens read-only when canvas is locked", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.lock();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).toHaveText(TITLE_NODE_EDITOR);

    // Read-only indicator should be shown and editor footer should be hidden.
    await expect(page.locator('[data-testid="panel-readonly-indicator"]')).toBeVisible();
    await expect(page.locator(SEL_PANEL_APPLY_BTN)).not.toBeVisible();
    await expect(page.locator(SEL_PANEL_OK_BTN)).not.toBeVisible();

    // Inputs should be disabled via <fieldset disabled>.
    await expect(page.locator("#node-name")).toBeDisabled();
  });

  test("OK button exists and is clickable in node editor", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();

    // OK button should exist in the footer
    const okBtn = page.locator(SEL_PANEL_OK_BTN);
    await expect(okBtn).toBeVisible();
    await expect(okBtn).toHaveText("OK");
    await expect(okBtn).toBeEnabled();
  });

  test("Apply button exists in node editor panel", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const applyBtn = page.locator(SEL_PANEL_APPLY_BTN);
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText("Apply");
  });

  test("click on different node opens editor for that node", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(1);

    // Open editor for first node
    await clickNode(page, nodeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toHaveText(TITLE_NODE_EDITOR);

    // Click on second node
    await clickNode(page, nodeIds[1]);

    // Editor should still show Node Editor
    await expect(panelTitle).toHaveText(TITLE_NODE_EDITOR);
  });
});
