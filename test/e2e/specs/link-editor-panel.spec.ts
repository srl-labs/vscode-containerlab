import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { getEdgeMidpoint, rightClick } from "../helpers/react-flow-helpers";

// Test selectors for the new MUI ContextPanel-based editor
const SEL_PANEL_TOGGLE_BTN = '[data-testid="panel-toggle-btn"]';
const SEL_PANEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';
const SEL_EDIT_EDGE_ITEM = '[data-testid="context-menu-item-edit-edge"]';

const PANEL_TITLE_LINK_EDITOR = "Link Editor";

/**
 * Link Editor Panel E2E Tests (MUI ContextPanel version)
 *
 * In the new MUI design, the link editor opens in the ContextPanel sidebar
 * when "Edit" is clicked from an edge's context menu.
 */
test.describe("Link Editor Panel", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  /** Opens the link editor via context menu for the given edge */
  async function openLinkEditor(page: Page, edgeId: string) {
    const midpoint = await getEdgeMidpoint(page, edgeId);
    expect(midpoint).not.toBeNull();
    await rightClick(page, midpoint!.x, midpoint!.y);
    const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
    await expect(editItem).toBeVisible();
    await editItem.click();
    await page.waitForTimeout(300);
  }

  test("opens link editor panel via context menu", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.getByText(PANEL_TITLE_LINK_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();
  });

  test("link editor panel has correct title", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const title = page.getByText(PANEL_TITLE_LINK_EDITOR, { exact: true });
    await expect(title).toBeVisible();
  });

  test("link editor panel has Basic tab selected by default", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const basicTab = page.locator('[data-testid="panel-tab-basic"]');
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveAttribute("aria-selected", "true");
  });

  test("closes link editor panel with toggle handle", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.getByText(PANEL_TITLE_LINK_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();

    const toggleBtn = page.locator(SEL_PANEL_TOGGLE_BTN);
    await toggleBtn.click();
    await page.waitForTimeout(300);

    await expect(panelTitle).not.toBeVisible();
  });

  test("returns to palette after closing and reopening panel", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.getByText(PANEL_TITLE_LINK_EDITOR, { exact: true });
    await expect(panelTitle).toBeVisible();
    const toggleBtn = page.locator(SEL_PANEL_TOGGLE_BTN);
    await toggleBtn.click();
    await page.waitForTimeout(200);
    await toggleBtn.click();

    await expect(page.getByPlaceholder("Search nodes...")).toBeVisible();
  });

  test("link editor does not open in view mode", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setViewMode();

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
    expect(midpoint).not.toBeNull();
    await rightClick(page, midpoint!.x, midpoint!.y);
    await page.waitForTimeout(200);

    await expect(page.locator(SEL_EDIT_EDGE_ITEM)).not.toBeVisible();
  });

  test("link editor does not open when canvas is locked", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setEditMode();
    await topoViewerPage.lock();

    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    const midpoint = await getEdgeMidpoint(page, edgeIds[0]);
    expect(midpoint).not.toBeNull();
    await rightClick(page, midpoint!.x, midpoint!.y);
    await page.waitForTimeout(200);

    const editItem = page.locator(SEL_EDIT_EDGE_ITEM);
    await expect(editItem).toBeVisible();
    await expect(editItem).toHaveAttribute("aria-disabled", "true");
  });

  test("Apply button exists in link editor panel", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const applyBtn = page.locator(SEL_PANEL_APPLY_BTN);
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText("Apply");
  });
});
