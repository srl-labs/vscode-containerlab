import { test, expect } from "../fixtures/topoviewer";

// Test selectors for the new MUI Popover-based find node
const SEL_FIND_NODE_BTN = '[data-testid="navbar-find-node"]';
const SEL_FIND_NODE_POPOVER = '[data-testid="find-node-popover"]';
const SEL_FIND_NODE_INPUT = '[data-testid="find-node-input"]';
const SEL_FIND_NODE_SEARCH_BTN = '[data-testid="find-node-search-btn"]';
const SEL_FIND_NODE_MATCH_COUNT = '[data-testid="find-node-match-count"]';

const PLACEHOLDER_TEXT = "Search for nodes...";

/**
 * Find Node Popover E2E Tests (MUI Popover version)
 *
 * In the new MUI design, find node is a Popover that opens below the navbar
 * button, containing a FindNodeSearchWidget with input, search button, and
 * match count display.
 */
test.describe("Find Node Popover", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.gotoFile("simple.clab.yml");
    await topoViewerPage.waitForCanvasReady();
  });

  test("opens find node popover via navbar button", async ({ page }) => {
    const findNodeBtn = page.locator(SEL_FIND_NODE_BTN);
    await expect(findNodeBtn).toBeVisible();
    await findNodeBtn.click();
    await page.waitForTimeout(300);

    const popover = page.locator(SEL_FIND_NODE_POPOVER);
    await expect(popover).toBeVisible();
  });

  test("find node popover has input field with placeholder", async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT);
    await expect(input).toBeVisible();

    // MUI TextField wraps input — check placeholder on nested input
    const nativeInput = input.locator("input");
    await expect(nativeInput).toHaveAttribute("placeholder", PLACEHOLDER_TEXT);
  });

  test("find node popover has search button", async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const searchBtn = page.locator(SEL_FIND_NODE_SEARCH_BTN);
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toHaveText("Search");
  });

  test("search finds matching nodes", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    const searchTerm = nodeIds[0].substring(0, 3);
    await input.fill(searchTerm);

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
    const text = await matchCount.textContent();
    expect(text).toMatch(/Found \d+ node/);
  });

  test("search with Enter key works", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill(nodeIds[0].substring(0, 3));
    await input.press("Enter");
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
  });

  test('search with no results shows "No nodes found"', async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill("xyznonexistent123");

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
    await expect(matchCount).toHaveText("No nodes found");
  });

  test("wildcard search finds all nodes", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill("*");

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
    const text = await matchCount.textContent();
    expect(text).toMatch(/Found \d+ node/);
  });

  test("prefix search with + works", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    const prefix = nodeIds[0].substring(0, 2);
    await input.fill(`+${prefix}`);

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
    const text = await matchCount.textContent();
    expect(text).toMatch(/Found \d+ node/);
  });

  test("search fits viewport to matching nodes", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);

    // Put the viewport into an obviously non-fit state.
    await topoViewerPage.setZoom(0.4);
    await topoViewerPage.setPan(800, 600);
    const before = { zoom: await topoViewerPage.getZoom(), pan: await topoViewerPage.getPan() };

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill(nodeIds[0]);

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();

    // fitBounds uses a 300ms duration; allow it to animate and settle.
    await expect
      .poll(async () => {
        const zoom = await topoViewerPage.getZoom();
        const pan = await topoViewerPage.getPan();
        const zoomChanged = Math.abs(zoom - before.zoom) > 0.05;
        const panChanged = Math.abs(pan.x - before.pan.x) > 5 || Math.abs(pan.y - before.pan.y) > 5;
        return zoomChanged || panChanged;
      }, { timeout: 5000 })
      .toBe(true);
  });

  test("search for specific node shows exact count", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();

    await topoViewerPage.clearSelection();

    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill(nodeIds[0]);

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(500);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).toBeVisible();
    await expect(matchCount).toHaveText("Found 1 node");
  });

  test("popover closes with Escape key", async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const popover = page.locator(SEL_FIND_NODE_POPOVER);
    await expect(popover).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(popover).not.toBeVisible();
  });

  test("input is auto-focused when popover opens", async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const nativeInput = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await expect(nativeInput).toBeFocused();
  });

  test("empty search does not show match count", async ({ page }) => {
    await page.locator(SEL_FIND_NODE_BTN).click();
    await page.waitForTimeout(300);

    const input = page.locator(SEL_FIND_NODE_INPUT).locator("input");
    await input.fill("");

    await page.locator(SEL_FIND_NODE_SEARCH_BTN).click();
    await page.waitForTimeout(300);

    const matchCount = page.locator(SEL_FIND_NODE_MATCH_COUNT);
    await expect(matchCount).not.toBeVisible();
  });
});
