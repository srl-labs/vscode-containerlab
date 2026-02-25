import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors for the new MUI ContextPanel-based editor
const SEL_PANEL_TAB_BASIC = '[data-testid="panel-tab-basic"]';
const SEL_PANEL_TOGGLE_BTN = '[data-testid="panel-toggle-btn"]';
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

    const panelTitle = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();
  });

  test("node editor panel has correct title", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const title = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(title).toBeVisible();
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

  test("closes node editor panel with toggle handle", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    const panelTitle = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();

    const toggleBtn = page.locator(SEL_PANEL_TOGGLE_BTN);
    await toggleBtn.click();
    await page.waitForTimeout(300);

    await expect(page.locator(SEL_PANEL_TAB_BASIC)).not.toBeVisible();
  });

  test("returns to palette after closing and reopening panel", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();
    const toggleBtn = page.locator(SEL_PANEL_TOGGLE_BTN);
    await toggleBtn.click();
    await page.waitForTimeout(200);
    await toggleBtn.click();
    await expect(page.getByPlaceholder("Search nodes...")).toBeVisible();
  });

  test("unlocked view mode keeps Info and adds visual-only Edit tab", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.setViewMode();
    await topoViewerPage.unlock();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    // Info remains available and is the default tab in view mode.
    const panelTitle = page.getByText("Node Properties", { exact: true });
    await expect(panelTitle).toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-info"]')).toHaveAttribute(
      ATTR_ARIA_SELECTED,
      ARIA_SELECTED_TRUE
    );
    await expect(page.locator('[data-testid="panel-tab-edit"]')).toBeVisible();

    // Visual edit tab is available for node icon / label-direction only.
    await page.locator('[data-testid="panel-tab-edit"]').click();
    await expect(page.getByText(TITLE_NODE_EDITOR, { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-basic"]')).toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-config"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-runtime"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-network"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="panel-tab-advanced"]')).not.toBeVisible();

    await expect(page.locator("#node-icon")).toBeVisible();
    await expect(page.locator("#node-label-position")).toBeVisible();
    await expect(page.locator("#node-direction")).toBeVisible();
    await expect(page.locator("#node-name")).not.toBeVisible();
    await expect(page.locator("#node-kind")).not.toBeVisible();

    // Changing label-position must enable Apply in visual-only editor.
    const applyBtn = page.locator(SEL_PANEL_APPLY_BTN);
    await expect(applyBtn).toHaveCount(0);
    await page.locator("#node-label-position").click();
    await page.locator('li[role="option"][aria-selected="false"]').first().click();
    await expect(applyBtn).toBeVisible();
  });

  test("locked view mode keeps node properties read-only", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setViewMode();
    await topoViewerPage.lock();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.getByText("Node Properties", { exact: true });
    await expect(panelTitle).toBeVisible();
  });

  test("node editor opens read-only when canvas is locked", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.lock();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await clickNode(page, nodeIds[0]);

    const panelTitle = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();

    // Read-only indicator should be shown and editor footer should be hidden.
    await expect(page.locator('[data-testid="panel-readonly-indicator"]')).toBeVisible();
    await expect(page.locator(SEL_PANEL_APPLY_BTN)).not.toBeVisible();

    // Inputs should be disabled via <fieldset disabled>.
    await expect(page.locator("#node-name")).toBeDisabled();
  });

  test("Apply button appears after editing in node editor panel", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    await clickNode(page, nodeIds[0]);

    // Apply is hidden until there are unsaved changes.
    const applyBtn = page.locator(SEL_PANEL_APPLY_BTN);
    await expect(applyBtn).toHaveCount(0);

    const nameInput = page.locator("#node-name");
    const currentName = await nameInput.inputValue();
    await nameInput.fill(`${currentName}-edited`);
    await nameInput.blur();

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

    const panelTitle = page.getByText(TITLE_NODE_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();

    // Click on second node
    await clickNode(page, nodeIds[1]);

    // Editor should still show Node Editor
    await expect(panelTitle).toBeVisible();
  });
});
