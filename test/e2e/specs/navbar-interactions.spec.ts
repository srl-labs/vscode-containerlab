import { test, expect } from "../fixtures/topoviewer";

// Test selectors
const SEL_NAVBAR_UNDO = '[data-testid="navbar-undo"]';
const SEL_NAVBAR_REDO = '[data-testid="navbar-redo"]';
const SEL_NAVBAR_LAYOUT = '[data-testid="navbar-layout"]';
const SEL_NAVBAR_MENU = ".navbar-menu";
const SEL_NAVBAR_LINK_LABELS = '[data-testid="navbar-link-labels"]';
const SEL_NAVBAR_GRID = '[data-testid="navbar-grid"]';

/**
 * Navbar Interactions E2E Tests
 *
 * Tests the navbar button functionality including:
 * - Undo/Redo buttons
 * - Fit to viewport
 * - Layout dropdown
 * - Link labels dropdown
 * - Various panel toggles
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

      const undoBtn = page.locator(SEL_NAVBAR_UNDO);
      const redoBtn = page.locator(SEL_NAVBAR_REDO);

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
      const layoutBtn = page.locator(SEL_NAVBAR_LAYOUT);
      await layoutBtn.click();
      await page.waitForTimeout(200);

      // Menu should appear
      const layoutMenu = page.locator(SEL_NAVBAR_MENU);
      await expect(layoutMenu).toBeVisible();

      // Check for layout options (Preset, Force-Directed, GeoMap)
      const menuOptions = page.locator(".navbar-menu-option");
      const count = await menuOptions.count();
      expect(count).toBe(3);

      // Click elsewhere to close
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x, canvasCenter.y);
      await page.waitForTimeout(200);

      await expect(layoutMenu).not.toBeVisible();
    });
  });

  test.describe("Link Labels Dropdown", () => {
    test("link labels dropdown has Show Labels, No Labels, and Show Dummy Links options", async ({
      page
    }) => {
      const linkLabelsBtn = page.locator(SEL_NAVBAR_LINK_LABELS);
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      const linkMenu = page.locator(SEL_NAVBAR_MENU);
      await expect(linkMenu).toBeVisible();

      // Verify all expected options are present
      await expect(page.locator('.navbar-menu-option:has-text("Show Labels")')).toBeVisible();
      await expect(page.locator('.navbar-menu-option:has-text("No Labels")')).toBeVisible();
      await expect(page.locator('.navbar-menu-option:has-text("Show Dummy Links")')).toBeVisible();
    });
  });

  test.describe("Grid Settings Dropdown", () => {
    test("grid dropdown has slider and reset button", async ({ page }) => {
      const gridBtn = page.locator(SEL_NAVBAR_GRID);
      await gridBtn.click();
      await page.waitForTimeout(200);

      const gridMenu = page.locator(".navbar-menu.grid-menu");
      await expect(gridMenu).toBeVisible();

      // Verify slider and reset button
      await expect(page.locator(".grid-line-slider")).toBeVisible();
      const resetButtons = page.locator(".grid-reset-button");
      await expect(resetButtons).toHaveCount(2);
      await expect(resetButtons.first()).toBeVisible();
      await expect(resetButtons.nth(1)).toBeVisible();
    });
  });

  test.describe("Panel Toggles", () => {
    test("shortcuts and about buttons open their respective panels", async ({ page }) => {
      // Test shortcuts panel
      const shortcutsBtn = page.locator('[data-testid="navbar-shortcuts"]');
      await shortcutsBtn.click();
      await page.waitForTimeout(300);

      const shortcutsPanel = page.locator('.panel-title:has-text("Shortcuts")');
      await expect(shortcutsPanel).toBeVisible();

      // Close shortcuts (click elsewhere or press Escape)
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);

      // Test about panel
      const aboutBtn = page.locator('[data-testid="navbar-about"]');
      await aboutBtn.click();
      await page.waitForTimeout(300);

      const aboutPanel = page.locator('.panel-title:has-text("About")');
      await expect(aboutPanel).toBeVisible();
    });
  });

  test.describe("Shortcut Display Toggle", () => {
    test("clicking shortcut display toggles its active state", async ({ page }) => {
      const shortcutDisplayBtn = page.locator('[data-testid="navbar-shortcut-display"]');
      await expect(shortcutDisplayBtn).toBeVisible();

      // Click to toggle
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      // Check if it has active class or changed state
      // The button should toggle between active and inactive states
      const hasActiveClass = await shortcutDisplayBtn.evaluate((el) =>
        el.classList.contains("active")
      );

      // Toggle back
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      const hasActiveClassAfter = await shortcutDisplayBtn.evaluate((el) =>
        el.classList.contains("active")
      );

      // State should have changed
      expect(hasActiveClass).not.toBe(hasActiveClassAfter);
    });

    test("shortcut display shows keypresses when enabled", async ({ page, topoViewerPage }) => {
      const shortcutDisplayBtn = page.locator('[data-testid="navbar-shortcut-display"]');

      // Enable shortcut display
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      // Verify button is active
      await expect(shortcutDisplayBtn).toHaveClass(/active/);

      // Click on canvas to ensure focus is not on input
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x, canvasCenter.y);
      await page.waitForTimeout(100);

      // Press a key
      await page.keyboard.press("a");
      await page.waitForTimeout(100);

      // Shortcut display should show the key (may have multiple items including "Left Click" from mouse)
      const keyDisplay = page.locator('.shortcut-display-item:has-text("A")');
      await expect(keyDisplay).toBeVisible();
    });
  });

  test.describe("Mode Badge Display", () => {
    test("navbar shows correct mode badge for viewer and editor modes", async ({
      page,
      topoViewerPage
    }) => {
      // Test view mode
      await topoViewerPage.setViewMode();
      await page.waitForTimeout(200);

      const viewerBadge = page.locator(".mode-badge.viewer");
      await expect(viewerBadge).toBeVisible();
      await expect(viewerBadge).toHaveText("viewer");

      // Test edit mode
      await topoViewerPage.setEditMode();
      await page.waitForTimeout(200);

      const editorBadge = page.locator(".mode-badge.editor");
      await expect(editorBadge).toBeVisible();
      await expect(editorBadge).toHaveText("editor");
    });
  });
});
