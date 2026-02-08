import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";
import { getEdgeMidpoint, rightClick } from "../helpers/react-flow-helpers";

// Test selectors for the new MUI ContextPanel-based editor
const SEL_PANEL_TITLE = '[data-testid="panel-title"]';
const SEL_PANEL_CLOSE_BTN = '[data-testid="panel-close-btn"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';
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

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).toHaveText(PANEL_TITLE_LINK_EDITOR);
  });

  test("link editor panel has correct title", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const title = page.locator(SEL_PANEL_TITLE);
    await expect(title).toBeVisible();
    await expect(title).toHaveText(PANEL_TITLE_LINK_EDITOR);
  });

  test("link editor panel has Basic tab selected by default", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const basicTab = page.locator('[data-testid="panel-tab-basic"]');
    await expect(basicTab).toBeVisible();
    await expect(basicTab).toHaveAttribute("aria-selected", "true");
  });

  test("closes link editor panel with close button", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();

    const closeBtn = page.locator(SEL_PANEL_CLOSE_BTN);
    await closeBtn.click();
    await page.waitForTimeout(300);

    await expect(panelTitle).not.toBeVisible();
  });

  test("closes link editor panel with OK button", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBeGreaterThan(0);

    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();
    await expect(panelTitle).toHaveText(PANEL_TITLE_LINK_EDITOR);

    // Avoid rare overlay interception (dev-only UI) by using keyboard activation.
    const okBtn = page.locator(SEL_PANEL_OK_BTN);
    await okBtn.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // OK returns the context panel back to palette view, which hides the header/title entirely.
    await expect(panelTitle).not.toBeVisible();
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

    await expect(page.locator(SEL_EDIT_EDGE_ITEM)).not.toBeVisible();
  });

  test("OK button exists and is clickable in link editor", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const panelTitle = page.locator(SEL_PANEL_TITLE);
    await expect(panelTitle).toBeVisible();

    // OK button should exist in the footer
    const okBtn = page.locator(SEL_PANEL_OK_BTN);
    await expect(okBtn).toBeVisible();
    await expect(okBtn).toHaveText("OK");
    await expect(okBtn).toBeEnabled();
  });

  test("Apply button exists in link editor panel", async ({ page, topoViewerPage }) => {
    const edgeIds = await topoViewerPage.getEdgeIds();
    await openLinkEditor(page, edgeIds[0]);

    const applyBtn = page.locator(SEL_PANEL_APPLY_BTN);
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toHaveText("Apply");
  });
});
