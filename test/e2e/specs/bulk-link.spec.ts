import { test, expect } from "../fixtures/topoviewer";
import { rightClick } from "../helpers/react-flow-helpers";

const EMPTY_FILE = "empty.clab.yml";
const KIND = "nokia_srlinux";
const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_BULK_LINK_ITEM = '[data-testid="context-menu-item-bulk-link"]';
const SEL_BULK_LINK_MODAL = '[data-testid="bulk-link-modal"]';
const SEL_BULK_LINK_SOURCE = '[data-testid="bulk-link-source"]';
const SEL_BULK_LINK_TARGET = '[data-testid="bulk-link-target"]';
const SEL_BULK_LINK_APPLY_BTN = '[data-testid="bulk-link-apply-btn"]';
const SEL_BULK_LINK_CANCEL_BTN = '[data-testid="bulk-link-cancel-btn"]';
const ERR_CANVAS_NOT_FOUND = "Canvas not found";

/**
 * Bulk Link Modal E2E Tests (MUI Dialog version)
 *
 * In the new MUI design, bulk link creation opens in a Dialog with
 * source/target pattern inputs and Apply/Cancel buttons. After Apply,
 * a confirmation dialog shows before creating the links.
 */
test.describe("Bulk Link Devices", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("opens bulk link modal via context menu", async ({ page, topoViewerPage }) => {
    const canvasBox = await topoViewerPage.getCanvas().boundingBox();
    if (!canvasBox) throw new Error(ERR_CANVAS_NOT_FOUND);
    await rightClick(page, canvasBox.x + 30, canvasBox.y + 30);

    const contextMenu = page.locator(SEL_CONTEXT_MENU);
    await expect(contextMenu).toBeVisible();

    await page.locator(SEL_BULK_LINK_ITEM).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_BULK_LINK_MODAL);
    await expect(modal).toBeVisible();
  });

  test("bulk link modal has source and target inputs", async ({ page, topoViewerPage }) => {
    const canvasBox = await topoViewerPage.getCanvas().boundingBox();
    if (!canvasBox) throw new Error(ERR_CANVAS_NOT_FOUND);
    await rightClick(page, canvasBox.x + 30, canvasBox.y + 30);
    await page.locator(SEL_BULK_LINK_ITEM).click();
    await page.waitForTimeout(300);

    await expect(page.locator(SEL_BULK_LINK_SOURCE)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_TARGET)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_APPLY_BTN)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_CANCEL_BTN)).toBeVisible();
  });

  test("cancel closes bulk link modal", async ({ page, topoViewerPage }) => {
    const canvasBox = await topoViewerPage.getCanvas().boundingBox();
    if (!canvasBox) throw new Error(ERR_CANVAS_NOT_FOUND);
    await rightClick(page, canvasBox.x + 30, canvasBox.y + 30);
    await page.locator(SEL_BULK_LINK_ITEM).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_BULK_LINK_MODAL);
    await expect(modal).toBeVisible();

    await page.locator(SEL_BULK_LINK_CANCEL_BTN).click();
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test("creates links between matched nodes", async ({ page, topoViewerPage }) => {
    // Create nodes first
    await topoViewerPage.createNode("leaf1", { x: 200, y: 120 }, KIND);
    await topoViewerPage.createNode("leaf2", { x: 200, y: 260 }, KIND);
    await topoViewerPage.createNode("spine1", { x: 460, y: 120 }, KIND);
    await topoViewerPage.createNode("spine2", { x: 460, y: 260 }, KIND);
    await expect.poll(() => topoViewerPage.getNodeCount()).toBe(4);
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(0);

    // Open bulk link modal via context menu
    const canvasBox = await topoViewerPage.getCanvas().boundingBox();
    if (!canvasBox) throw new Error(ERR_CANVAS_NOT_FOUND);
    await rightClick(page, canvasBox.x + 30, canvasBox.y + 30);
    await page.locator(SEL_BULK_LINK_ITEM).click();
    await page.waitForTimeout(300);

    // Fill source and target patterns
    await page.locator(SEL_BULK_LINK_SOURCE).locator("input").fill("leaf*");
    await page.locator(SEL_BULK_LINK_TARGET).locator("input").fill("spine*");

    // Click Apply to compute candidates
    await page.locator(SEL_BULK_LINK_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Confirm link creation in the confirmation dialog
    const createLinksBtn = page.getByRole("button", { name: "Create Links" });
    await expect(createLinksBtn).toBeVisible({ timeout: 3000 });
    await createLinksBtn.click();
    await page.waitForTimeout(500);

    // Verify 4 cross-links were created (leaf1→spine1, leaf1→spine2, leaf2→spine1, leaf2→spine2)
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(4);

    // Verify YAML has endpoints
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const endpointCount = (yaml.match(/endpoints:/g) ?? []).length;
    expect(endpointCount).toBe(4);

    // Batch undo removes all links at once
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(0);

    // Batch redo restores all links
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount()).toBe(4);
  });
});
