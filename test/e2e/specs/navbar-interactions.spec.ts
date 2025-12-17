import { test, expect } from '../fixtures/topoviewer';

/**
 * Navbar Interactions E2E Tests
 *
 * Tests the navbar button functionality including:
 * - Undo/Redo buttons
 * - Fit to viewport
 * - Layout dropdown
 * - Link labels dropdown
 * - Various panel toggles
 *
 * KNOWN BUGS:
 * - None discovered yet
 */
test.describe('Navbar Interactions', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
  });

  test.describe('Basic Button Visibility', () => {
    test('navbar has all expected buttons', async ({ page }) => {
      const expectedButtons = [
        'navbar-lab-settings',
        'navbar-fit-viewport',
        'navbar-split-view',
        'navbar-layout',
        'navbar-grid',
        'navbar-find-node',
        'navbar-link-labels',
        'navbar-capture',
        'navbar-shortcuts',
        'navbar-about'
      ];

      for (const testId of expectedButtons) {
        const btn = page.locator(`[data-testid="${testId}"]`);
        await expect(btn).toBeVisible();
      }
    });
  });

  test.describe('Undo/Redo Buttons - Edit Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();
    });

    test('undo button is visible in edit mode', async ({ page }) => {
      const undoBtn = page.locator('[data-testid="navbar-undo"]');
      await expect(undoBtn).toBeVisible();
    });

    test('redo button is visible in edit mode', async ({ page }) => {
      const redoBtn = page.locator('[data-testid="navbar-redo"]');
      await expect(redoBtn).toBeVisible();
    });

    test('undo button is initially disabled (no history)', async ({ page }) => {
      const undoBtn = page.locator('[data-testid="navbar-undo"]');
      await expect(undoBtn).toBeDisabled();
    });

    test('redo button is initially disabled (no history)', async ({ page }) => {
      const redoBtn = page.locator('[data-testid="navbar-redo"]');
      await expect(redoBtn).toBeDisabled();
    });
  });

  test.describe('Undo/Redo Buttons - View Mode', () => {
    test.beforeEach(async ({ topoViewerPage }) => {
      await topoViewerPage.setViewMode();
    });

    test('undo button is NOT visible in view mode', async ({ page }) => {
      const undoBtn = page.locator('[data-testid="navbar-undo"]');
      await expect(undoBtn).not.toBeVisible();
    });

    test('redo button is NOT visible in view mode', async ({ page }) => {
      const redoBtn = page.locator('[data-testid="navbar-redo"]');
      await expect(redoBtn).not.toBeVisible();
    });
  });

  test.describe('Fit to Viewport', () => {
    test('clicking fit viewport button changes zoom/pan', async ({ page, topoViewerPage }) => {
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

  test.describe('Layout Dropdown', () => {
    test('clicking layout button opens dropdown menu', async ({ page }) => {
      const layoutBtn = page.locator('[data-testid="navbar-layout"]');
      await layoutBtn.click();
      await page.waitForTimeout(200);

      // Menu should appear
      const layoutMenu = page.locator('.navbar-menu');
      await expect(layoutMenu).toBeVisible();
    });

    test('layout menu has expected options', async ({ page }) => {
      const layoutBtn = page.locator('[data-testid="navbar-layout"]');
      await layoutBtn.click();
      await page.waitForTimeout(200);

      // Check for layout options
      const menuOptions = page.locator('.navbar-menu-option');
      const count = await menuOptions.count();
      expect(count).toBeGreaterThanOrEqual(4); // Preset, COSE, Cola, etc.
    });

    test('clicking outside layout menu closes it', async ({ page, topoViewerPage }) => {
      const layoutBtn = page.locator('[data-testid="navbar-layout"]');
      await layoutBtn.click();
      await page.waitForTimeout(200);

      const layoutMenu = page.locator('.navbar-menu');
      await expect(layoutMenu).toBeVisible();

      // Click elsewhere
      const canvasCenter = await topoViewerPage.getCanvasCenter();
      await page.mouse.click(canvasCenter.x, canvasCenter.y);
      await page.waitForTimeout(200);

      await expect(layoutMenu).not.toBeVisible();
    });
  });

  test.describe('Link Labels Dropdown', () => {
    test('clicking link labels button opens dropdown menu', async ({ page }) => {
      const linkLabelsBtn = page.locator('[data-testid="navbar-link-labels"]');
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      const linkMenu = page.locator('.navbar-menu');
      await expect(linkMenu).toBeVisible();
    });

    test('link labels menu has Show Labels option', async ({ page }) => {
      const linkLabelsBtn = page.locator('[data-testid="navbar-link-labels"]');
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      const showLabelsOption = page.locator('.navbar-menu-option:has-text("Show Labels")');
      await expect(showLabelsOption).toBeVisible();
    });

    test('link labels menu has No Labels option', async ({ page }) => {
      const linkLabelsBtn = page.locator('[data-testid="navbar-link-labels"]');
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      const noLabelsOption = page.locator('.navbar-menu-option:has-text("No Labels")');
      await expect(noLabelsOption).toBeVisible();
    });

    test('link labels menu has Show Dummy Links option', async ({ page }) => {
      const linkLabelsBtn = page.locator('[data-testid="navbar-link-labels"]');
      await linkLabelsBtn.click();
      await page.waitForTimeout(200);

      const dummyLinksOption = page.locator('.navbar-menu-option:has-text("Show Dummy Links")');
      await expect(dummyLinksOption).toBeVisible();
    });
  });

  test.describe('Grid Settings Dropdown', () => {
    test('clicking grid button opens dropdown menu', async ({ page }) => {
      const gridBtn = page.locator('[data-testid="navbar-grid"]');
      await gridBtn.click();
      await page.waitForTimeout(200);

      const gridMenu = page.locator('.navbar-menu.grid-menu');
      await expect(gridMenu).toBeVisible();
    });

    test('grid menu has slider input', async ({ page }) => {
      const gridBtn = page.locator('[data-testid="navbar-grid"]');
      await gridBtn.click();
      await page.waitForTimeout(200);

      const slider = page.locator('.grid-line-slider');
      await expect(slider).toBeVisible();
    });

    test('grid menu has reset button', async ({ page }) => {
      const gridBtn = page.locator('[data-testid="navbar-grid"]');
      await gridBtn.click();
      await page.waitForTimeout(200);

      const resetBtn = page.locator('.grid-reset-button');
      await expect(resetBtn).toBeVisible();
    });
  });

  test.describe('Panel Toggles', () => {
    test('clicking shortcuts button opens shortcuts panel', async ({ page }) => {
      const shortcutsBtn = page.locator('[data-testid="navbar-shortcuts"]');
      await shortcutsBtn.click();
      await page.waitForTimeout(300);

      // Shortcuts panel should appear (look for panel with "Shortcuts" in title)
      const shortcutsPanel = page.locator('.panel-title:has-text("Shortcuts")');
      await expect(shortcutsPanel).toBeVisible();
    });

    test('clicking about button opens about panel', async ({ page }) => {
      const aboutBtn = page.locator('[data-testid="navbar-about"]');
      await aboutBtn.click();
      await page.waitForTimeout(300);

      // About panel should appear
      const aboutPanel = page.locator('.panel-title:has-text("About")');
      await expect(aboutPanel).toBeVisible();
    });

  });

  test.describe('Shortcut Display Toggle', () => {
    test('clicking shortcut display toggles its active state', async ({ page }) => {
      const shortcutDisplayBtn = page.locator('[data-testid="navbar-shortcut-display"]');
      await expect(shortcutDisplayBtn).toBeVisible();

      // Click to toggle
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      // Check if it has active class or changed state
      // The button should toggle between active and inactive states
      const hasActiveClass = await shortcutDisplayBtn.evaluate(
        (el) => el.classList.contains('active')
      );

      // Toggle back
      await shortcutDisplayBtn.click();
      await page.waitForTimeout(200);

      const hasActiveClassAfter = await shortcutDisplayBtn.evaluate(
        (el) => el.classList.contains('active')
      );

      // State should have changed
      expect(hasActiveClass).not.toBe(hasActiveClassAfter);
    });
  });

  test.describe('Mode Badge Display', () => {
    test('navbar shows viewer badge in view mode', async ({ page, topoViewerPage }) => {
      await topoViewerPage.setViewMode();
      await page.waitForTimeout(200);

      const viewerBadge = page.locator('.mode-badge.viewer');
      await expect(viewerBadge).toBeVisible();
      await expect(viewerBadge).toHaveText('viewer');
    });

    test('navbar shows editor badge in edit mode', async ({ page, topoViewerPage }) => {
      await topoViewerPage.setEditMode();
      await page.waitForTimeout(200);

      const editorBadge = page.locator('.mode-badge.editor');
      await expect(editorBadge).toBeVisible();
      await expect(editorBadge).toHaveText('editor');
    });
  });
});
