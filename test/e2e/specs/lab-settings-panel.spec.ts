import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

const SIMPLE_FILE = "simple.clab.yml";

// Test selectors
const SEL_LAB_SETTINGS_PANEL = '[data-testid="lab-settings"]';
const SEL_LAB_SETTINGS_BTN = '[data-testid="navbar-lab-settings"]';
const SEL_PANEL_TITLE = '[data-testid="panel-title"]';
const SEL_PANEL_CLOSE_BTN = '[data-testid="panel-close-btn"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';
const SEL_PANEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';

/**
 * Helper to reliably open lab settings panel via navbar button
 */
async function openLabSettingsPanel(page: Page): Promise<void> {
  const labSettingsBtn = page.locator(SEL_LAB_SETTINGS_BTN);
  await expect(labSettingsBtn).toBeVisible();
  await labSettingsBtn.click();
  await page.waitForTimeout(300);

  const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
  await expect(panel).toBeVisible({ timeout: 2000 });
}

/**
 * Helper to close lab settings panel
 */
async function closeLabSettingsPanel(page: Page): Promise<void> {
  const closeBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_CLOSE_BTN}`);
  await closeBtn.click();
  await page.waitForTimeout(300);
}

/**
 * Lab Settings Panel E2E Tests
 *
 * Tests the lab settings panel functionality including:
 * - Opening via navbar button
 * - Tab navigation (Basic/Management)
 * - Panel close behavior
 * - Field read-only states based on mode/lock
 * - Save functionality and YAML persistence
 */
test.describe("Lab Settings Panel", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("opens lab settings panel via navbar button", async ({ page }) => {
    const labSettingsBtn = page.locator(SEL_LAB_SETTINGS_BTN);
    await expect(labSettingsBtn).toBeVisible();

    await labSettingsBtn.click();
    await page.waitForTimeout(300);

    // Panel should appear
    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
    await expect(panel).toBeVisible();
  });

  test("lab settings panel has correct title", async ({ page }) => {
    await openLabSettingsPanel(page);

    const title = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_TITLE}`);
    await expect(title).toBeVisible();
    await expect(title).toHaveText("Lab Settings");
  });

  test("lab settings panel shows current lab name", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Find the lab name input field
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    await expect(labNameInput).toBeVisible();

    // Should have value "simple" from simple.clab.yml
    const value = await labNameInput.inputValue();
    expect(value).toBe("simple");
  });

  test("lab settings panel has Basic tab", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Basic tab should exist
    const basicTab = page.locator(`${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Basic")`);
    await expect(basicTab).toBeVisible();
  });

  test("lab settings panel has Management tab", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Management tab should exist
    const mgmtTab = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Management")`
    );
    await expect(mgmtTab).toBeVisible();
  });

  test("Basic tab is active by default", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Basic tab should have active class
    const basicTab = page.locator(`${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Basic")`);
    await expect(basicTab).toHaveClass(/tab-active/);
  });

  test("can switch to Management tab", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Click Management tab
    const mgmtTab = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Management")`
    );
    await mgmtTab.click();
    await page.waitForTimeout(200);

    // Management tab should now be active
    await expect(mgmtTab).toHaveClass(/tab-active/);

    // Basic tab should no longer be active
    const basicTab = page.locator(`${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Basic")`);
    await expect(basicTab).not.toHaveClass(/tab-active/);
  });

  test("can change lab name in Basic tab", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Find the lab name input field
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();

    // Clear and type new name
    await labNameInput.clear();
    await labNameInput.fill("test-lab");
    await page.waitForTimeout(100);

    // Value should be updated
    const value = await labNameInput.inputValue();
    expect(value).toBe("test-lab");
  });

  test("Save button exists in lab settings panel", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Save button should exist (primary button)
    const saveBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_OK_BTN}`);
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toHaveText("Save");
  });

  test("Close button exists in lab settings panel", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Close button should exist (secondary button in footer)
    const closeBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_APPLY_BTN}`);
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toHaveText("Close");
  });

  test("save button persists lab name to YAML", async ({ page, topoViewerPage }) => {
    await openLabSettingsPanel(page);

    // Change lab name
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    await labNameInput.clear();
    await labNameInput.fill("updated-lab");

    // Click Save button
    const saveBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_OK_BTN}`);
    await saveBtn.click();
    await page.waitForTimeout(500);

    // Panel should close after save
    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
    await expect(panel).not.toBeVisible();

    // Verify YAML was updated
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain("name: updated-lab");
  });

  test("lab settings panel closes with close button in header", async ({ page }) => {
    await openLabSettingsPanel(page);

    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
    await expect(panel).toBeVisible();

    // Click X button in header
    const closeBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_CLOSE_BTN}`);
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });

  test("lab settings panel closes with Close button in footer", async ({ page }) => {
    await openLabSettingsPanel(page);

    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
    await expect(panel).toBeVisible();

    // Click Close button in footer (Apply button)
    const closeBtn = page.locator(`${SEL_LAB_SETTINGS_PANEL} ${SEL_PANEL_APPLY_BTN}`);
    await closeBtn.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });

  test("lab settings panel closes with Escape key", async ({ page }) => {
    await openLabSettingsPanel(page);

    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);
    await expect(panel).toBeVisible();

    // Press Escape key
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Panel should be hidden
    await expect(panel).not.toBeVisible();
  });

  test("lab settings fields are read-only when canvas is locked", async ({
    page,
    topoViewerPage
  }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    await openLabSettingsPanel(page);

    // Lab name input should be disabled
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    await expect(labNameInput).toBeDisabled();

    // Prefix select should be disabled
    const prefixSelect = page.locator(`${SEL_LAB_SETTINGS_PANEL} select`).first();
    await expect(prefixSelect).toBeDisabled();
  });

  test("lab settings fields are read-only in view mode", async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    await openLabSettingsPanel(page);

    // Lab name input should be disabled
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    await expect(labNameInput).toBeDisabled();

    // Prefix select should be disabled
    const prefixSelect = page.locator(`${SEL_LAB_SETTINGS_PANEL} select`).first();
    await expect(prefixSelect).toBeDisabled();
  });

  test("footer buttons are hidden when in view mode", async ({ page, topoViewerPage }) => {
    // Switch to view mode
    await topoViewerPage.setViewMode();

    await openLabSettingsPanel(page);

    // Footer should not be visible in view mode
    const footer = page.locator(`${SEL_LAB_SETTINGS_PANEL} .panel-footer`);
    await expect(footer).not.toBeVisible();
  });

  test("footer buttons are hidden when canvas is locked", async ({ page, topoViewerPage }) => {
    // Lock the canvas
    await topoViewerPage.lock();

    await openLabSettingsPanel(page);

    // Footer should not be visible when locked
    const footer = page.locator(`${SEL_LAB_SETTINGS_PANEL} .panel-footer`);
    await expect(footer).not.toBeVisible();
  });

  test("can change prefix type to custom and enter custom prefix", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Find prefix select
    const prefixSelect = page.locator(`${SEL_LAB_SETTINGS_PANEL} select`).first();
    await prefixSelect.selectOption("custom");
    await page.waitForTimeout(200);

    // Custom prefix input should appear
    const customPrefixInput = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} input[placeholder="Enter custom prefix"]`
    );
    await expect(customPrefixInput).toBeVisible();

    // Enter custom prefix
    await customPrefixInput.fill("myprefix");
    await page.waitForTimeout(100);

    // Value should be set
    const value = await customPrefixInput.inputValue();
    expect(value).toBe("myprefix");
  });

  test("custom prefix input is hidden when prefix type is not custom", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Find prefix select and select "default"
    const prefixSelect = page.locator(`${SEL_LAB_SETTINGS_PANEL} select`).first();
    await prefixSelect.selectOption("default");
    await page.waitForTimeout(200);

    // Custom prefix input should NOT be visible
    const customPrefixInput = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} input[placeholder="Enter custom prefix"]`
    );
    await expect(customPrefixInput).not.toBeVisible();
  });

  test("Management tab shows network name field", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Switch to Management tab
    const mgmtTab = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Management")`
    );
    await mgmtTab.click();
    await page.waitForTimeout(200);

    // Network name field should exist (look for label text)
    const networkNameLabel = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} label:has-text("Network Name")`
    );
    await expect(networkNameLabel).toBeVisible();
  });

  test("Management tab shows IPv4 configuration fields", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Switch to Management tab
    const mgmtTab = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Management")`
    );
    await mgmtTab.click();
    await page.waitForTimeout(200);

    // Look for IPv4 related labels
    const ipv4Label = page.locator(`${SEL_LAB_SETTINGS_PANEL} label:has-text("IPv4")`).first();
    await expect(ipv4Label).toBeVisible();
  });

  test("Management tab shows IPv6 configuration fields", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Switch to Management tab
    const mgmtTab = page.locator(
      `${SEL_LAB_SETTINGS_PANEL} .panel-tab-button:has-text("Management")`
    );
    await mgmtTab.click();
    await page.waitForTimeout(200);

    // Look for IPv6 related labels
    const ipv6Label = page.locator(`${SEL_LAB_SETTINGS_PANEL} label:has-text("IPv6")`).first();
    await expect(ipv6Label).toBeVisible();
  });

  test("reopening panel after closing preserves data", async ({ page }) => {
    await openLabSettingsPanel(page);

    // Verify initial name
    const labNameInput = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    const initialValue = await labNameInput.inputValue();
    expect(initialValue).toBe("simple");

    // Close panel
    await closeLabSettingsPanel(page);

    // Reopen panel
    await openLabSettingsPanel(page);

    // Name should still be 'simple'
    const labNameInputAfter = page.locator(`${SEL_LAB_SETTINGS_PANEL} input[type="text"]`).first();
    const valueAfter = await labNameInputAfter.inputValue();
    expect(valueAfter).toBe("simple");
  });

  test("toggling navbar button opens and closes panel", async ({ page }) => {
    const labSettingsBtn = page.locator(SEL_LAB_SETTINGS_BTN);
    const panel = page.locator(SEL_LAB_SETTINGS_PANEL);

    // First click - open
    await labSettingsBtn.click();
    await page.waitForTimeout(300);
    await expect(panel).toBeVisible();

    // Second click - close
    await labSettingsBtn.click();
    await page.waitForTimeout(300);
    await expect(panel).not.toBeVisible();

    // Third click - open again
    await labSettingsBtn.click();
    await page.waitForTimeout(300);
    await expect(panel).toBeVisible();
  });
});
