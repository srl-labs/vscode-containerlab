import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

const EMPTY_FILE = "empty.clab.yml";
const KIND = "nokia_srlinux";
const SEL_NAVBAR_BULK_LINK = '[data-testid="navbar-bulk-link"]';
const SEL_BULK_LINK_MODAL = '[data-testid="bulk-link-modal"]';
const SEL_BULK_LINK_SOURCE = '[data-testid="bulk-link-source"]';
const SEL_BULK_LINK_TARGET = '[data-testid="bulk-link-target"]';
const SEL_BULK_LINK_APPLY_BTN = '[data-testid="bulk-link-apply-btn"]';
const SEL_BULK_LINK_CLOSE_BTN = '[data-testid="bulk-link-close-btn"]';

/**
 * Bulk Link Modal E2E Tests (MUI Dialog version)
 *
 * In the new MUI design, bulk link creation opens from the navbar button
 * in a Dialog with source/target pattern inputs and an Apply button. After Apply,
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

  async function openBulkLinkModal(page: Page): Promise<void> {
    await page.locator(SEL_NAVBAR_BULK_LINK).click();
    await page.waitForTimeout(300);
  }

  test("opens bulk link modal via navbar button", async ({ page }) => {
    await openBulkLinkModal(page);

    const modal = page.locator(SEL_BULK_LINK_MODAL);
    await expect(modal).toBeVisible();
  });

  test("bulk link modal has source and target inputs", async ({ page }) => {
    await openBulkLinkModal(page);

    await expect(page.locator(SEL_BULK_LINK_SOURCE)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_TARGET)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_APPLY_BTN)).toBeVisible();
    await expect(page.locator(SEL_BULK_LINK_CLOSE_BTN)).toBeVisible();
  });

  test("close button closes bulk link modal", async ({ page }) => {
    await openBulkLinkModal(page);

    const modal = page.locator(SEL_BULK_LINK_MODAL);
    await expect(modal).toBeVisible();

    await page.locator(SEL_BULK_LINK_CLOSE_BTN).click();
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

    // Open bulk link modal via navbar
    await openBulkLinkModal(page);

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
