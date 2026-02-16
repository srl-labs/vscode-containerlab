import { test, expect } from "../fixtures/topoviewer";

const ATTR_DATA_TESTID = "data-testid";

/**
 * Navbar Interactions E2E Tests (MUI version)
 *
 * Tests the navbar button functionality including:
 * - Button visibility
 * - Undo/Redo buttons
 * - Fit to viewport
 * - Layout dropdown (MUI Menu)
 * - Link labels dropdown (MUI Menu)
 * - Grid settings (MUI Popover)
 * - Shortcuts/About modals (MUI Dialog)
 * - Shortcut display toggle
 */
test.describe("Navbar Interactions", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test.describe("Basic Button Visibility", () => {
    test("navbar has all expected buttons", async ({ page }) => {
      const expectedButtons = [
        "navbar-lab-settings",
        "navbar-fit-viewport",
        "navbar-split-view",
        "navbar-layout",
        "navbar-grid",
        "navbar-find-node",
        "navbar-link-labels",
        "navbar-capture",
        "navbar-shortcuts",
        "navbar-about"
      ];

      for (const testId of expectedButtons) {
        const btn = page.locator(`[data-testid="${testId}"]`);
        await expect(btn).toBeVisible();
      }
    });
  });

  test.describe("Undo/Redo Buttons", () => {
    test("undo/redo buttons visible and disabled in edit mode, hidden in view mode", async ({
      page,
      topoViewerPage
    }) => {
      // Test edit mode
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      const undoBtn = page.locator('[data-testid="navbar-undo"]');
      const redoBtn = page.locator('[data-testid="navbar-redo"]');

      // Both should be visible in edit mode
      await expect(undoBtn).toBeVisible();
      await expect(redoBtn).toBeVisible();

      // Both should be initially disabled (no history)
      await expect(undoBtn).toBeDisabled();
      await expect(redoBtn).toBeDisabled();

      // Test view mode
      await topoViewerPage.setViewMode();

      // Both should be hidden in view mode
      await expect(undoBtn).not.toBeVisible();
      await expect(redoBtn).not.toBeVisible();
    });
  });

  test.describe("Fit to Viewport", () => {
    test("clicking fit viewport button changes zoom/pan", async ({ page, topoViewerPage }) => {
      // Change zoom first
      await topoViewerPage.setZoom(0.5);
      const zoomBefore = await topoViewerPage.getZoom();
      expect(zoomBefore).toBeCloseTo(0.5, 1);

      // Click fit viewport
      const fitViewportBtn = page.locator('[data-testid="navbar-fit-viewport"]');
      await fitViewportBtn.click();
      await page.waitForTimeout(500);

      // Zoom should change (fit calculates optimal zoom)
      const zoomAfter = await topoViewerPage.getZoom();
      expect(zoomAfter).not.toBeCloseTo(0.5, 1);
    });
  });

  test.describe("Layout Dropdown", () => {
    test("layout dropdown opens, has options, and closes on click outside", async ({
      page,
      topoViewerPage
    }) => {
      const layoutBtn = page.locator('[data-testid="navbar-layout"]');
      await layoutBtn.click();
      await page.waitForTimeout(200);

      // MUI Menu should appear with all 3 layout options
      await expect(page.locator('[data-testid="navbar-layout-preset"]')).toBeVisible();
      await expect(page.locator('[data-testid="navbar-layout-force"]')).toBeVisible();
      await expect(page.locator('[data-testid="navbar-layout-geo"]')).toBeVisible();

      // Click elsewhere to close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="navbar-layout-preset"]')).not.toBeVisible();
    });
  });

  test.describe("Link Labels Dropdown", () => {
    test("link labels dropdown has Show All, On Select, and Hide options", async ({
      page
    }) => {
      const linkLabelsBtn = page.locator('[data-testid="navbar-link-labels"]');
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      // Verify all expected MUI menu items are present
      await expect(page.locator('[data-testid="navbar-link-label-show-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="navbar-link-label-on-select"]')).toBeVisible();
      await expect(page.locator('[data-testid="navbar-link-label-hide"]')).toBeVisible();
    });
  });

  test.describe("Grid Settings Popover", () => {
    test("grid popover opens with slider and style toggles", async ({ page }) => {
      const gridBtn = page.locator('[data-testid="navbar-grid"]');
      await gridBtn.click();
      await page.waitForTimeout(200);

      // MUI Popover should appear
      const gridPopover = page.locator('[data-testid="grid-settings-popover"]');
      await expect(gridPopover).toBeVisible();

      // Verify slider exists (MUI Slider)
      const slider = gridPopover.locator(".MuiSlider-root");
      await expect(slider).toBeVisible();

      // Verify toggle buttons exist (Dotted/Quadratic)
      const toggleGroup = gridPopover.locator(".MuiToggleButtonGroup-root");
      await expect(toggleGroup).toBeVisible();
    });
  });

  test.describe("Panel Toggles", () => {
    test("shortcuts and about buttons open their respective modals", async ({ page }) => {
      // Test shortcuts modal
      const shortcutsBtn = page.locator('[data-testid="navbar-shortcuts"]');
      await shortcutsBtn.click();
      await page.waitForTimeout(300);

      const shortcutsModal = page.locator('[data-testid="shortcuts-modal"]');
      await expect(shortcutsModal).toBeVisible();

      // Close shortcuts (press Escape)
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await expect(shortcutsModal).not.toBeVisible();

      // Test about modal
      const aboutBtn = page.locator('[data-testid="navbar-about"]');
      await aboutBtn.click();
      await page.waitForTimeout(300);

      const aboutModal = page.locator('[data-testid="about-modal"]');
      await expect(aboutModal).toBeVisible();
    });
  });

  test.describe("Shortcut Display Toggle", () => {
    test("clicking shortcut display toggles the icon", async ({ page }) => {
      const shortcutDisplayBtn = page.locator('[data-testid="navbar-shortcut-display"]');
      await expect(shortcutDisplayBtn).toBeVisible();

      // Get initial icon (VisibilityOff when disabled)
      const initialIcon = await shortcutDisplayBtn.locator("svg").getAttribute(ATTR_DATA_TESTID);

      // Click to toggle
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      // Icon should have changed (VisibilityOff <-> Visibility)
      const toggledIcon = await shortcutDisplayBtn.locator("svg").getAttribute(ATTR_DATA_TESTID);

      // Toggle back
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      const restoredIcon = await shortcutDisplayBtn.locator("svg").getAttribute(ATTR_DATA_TESTID);

      // State should have toggled and been restored
      expect(initialIcon).toBe(restoredIcon);
      expect(initialIcon).not.toBe(toggledIcon);
    });

    test("shortcut display shows keypresses when enabled", async ({ page, topoViewerPage }) => {
      const shortcutDisplayBtn = page.locator('[data-testid="navbar-shortcut-display"]');
      await expect(shortcutDisplayBtn).toBeVisible();

      // Enable shortcut display.
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      // Click on canvas so the keydown isn't targeted at an input.
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x, canvasCenter.y);
      await page.waitForTimeout(100);

      await page.keyboard.press("a");

      // Key display should show "A" (uppercase).
      const keyDisplay = page.locator(".shortcut-display-item").filter({ hasText: /^A$/ });
      await expect(keyDisplay).toBeVisible({ timeout: 3000 });
    });
  });
});
