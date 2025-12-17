import { test, expect } from '../fixtures/topoviewer';

/**
 * Find Node Panel E2E Tests
 *
 * Tests the find/search node functionality including:
 * - Opening via navbar button
 * - Search with exact match
 * - Search with wildcard
 * - Search with prefix
 * - No results handling
 * - Selection behavior
 * - Zoom to fit found nodes
 *
 * KNOWN BUGS:
 * - None discovered yet
 */
test.describe('Find Node Panel', () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.goto('sampleWithAnnotations');
    await topoViewerPage.waitForCanvasReady();
  });

  test('opens find node panel via navbar button', async ({ page }) => {
    // Click the find node button in navbar
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await expect(findNodeBtn).toBeVisible();
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    // Find node panel should appear
    const findNodePanel = page.locator('[data-testid="find-node-panel"]');
    await expect(findNodePanel).toBeVisible();
  });

  test('find node panel has input field', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Search for nodes ...');
  });

  test('find node panel has search button', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toHaveText('Search');
  });

  test('search finds matching nodes', async ({ page, topoViewerPage }) => {
    // First get a node name to search for
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Open find panel
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    // Type search term (use first part of node id)
    const input = page.locator('[data-testid="find-node-input"]');
    const searchTerm = nodeIds[0].substring(0, 3); // First 3 characters
    await input.fill(searchTerm);

    // Click search button
    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(300);

    // Result should appear
    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).toBeVisible();
    // Should find at least one node
    const resultText = await result.textContent();
    expect(resultText).toMatch(/Found \d+ node/);
  });

  test('search with Enter key works', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();

    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    const searchTerm = nodeIds[0].substring(0, 3);
    await input.fill(searchTerm);
    await input.press('Enter');
    await page.waitForTimeout(300);

    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).toBeVisible();
  });

  test('search with no results shows "No nodes found"', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    await input.fill('xyznonexistent123');

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(300);

    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).toBeVisible();
    await expect(result).toHaveText('No nodes found');
  });

  test('wildcard search works', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    // Use wildcard pattern
    await input.fill('*');

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(300);

    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).toBeVisible();
    // Should find all nodes
    const resultText = await result.textContent();
    expect(resultText).toMatch(/Found \d+ node/);
  });

  test('search selects found nodes', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();

    // Clear any existing selection
    await topoViewerPage.clearSelection();

    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    // Search for specific node
    await input.fill(nodeIds[0]);

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(500);

    // Check that nodes are selected
    const selectedIds = await topoViewerPage.getSelectedNodeIds();
    expect(selectedIds.length).toBeGreaterThan(0);
  });

  test('closes find node panel with close button', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const findNodePanel = page.locator('[data-testid="find-node-panel"]');
    await expect(findNodePanel).toBeVisible();

    // Click close button
    const closeBtn = page.locator('[data-testid="find-node-panel"] [data-testid="panel-close-btn"]');
    await closeBtn.click();
    await page.waitForTimeout(300);

    await expect(findNodePanel).not.toBeVisible();
  });

  test('closes find node panel with Escape key', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const findNodePanel = page.locator('[data-testid="find-node-panel"]');
    await expect(findNodePanel).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(findNodePanel).not.toBeVisible();
  });

  test('input is focused when panel opens', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    await expect(input).toBeFocused();
  });

  test('prefix search with + works', async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    // Use prefix pattern (+ means starts-with)
    const prefix = nodeIds[0].substring(0, 2);
    await input.fill(`+${prefix}`);

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(300);

    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).toBeVisible();
    const resultText = await result.textContent();
    expect(resultText).toMatch(/Found \d+ node/);
  });

  test('empty search does not show results', async ({ page }) => {
    const findNodeBtn = page.locator('[data-testid="navbar-find-node"]');
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const input = page.locator('[data-testid="find-node-input"]');
    await input.fill('');

    const searchBtn = page.locator('[data-testid="find-node-search-btn"]');
    await searchBtn.click();
    await page.waitForTimeout(300);

    // Result should not appear for empty search
    const result = page.locator('[data-testid="find-node-result"]');
    await expect(result).not.toBeVisible();
  });
});
