import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors
const SEL_NODE_EDITOR = '[data-testid="node-editor"]';
const SEL_APPLY_BTN = '[data-testid="node-editor"] [data-testid="panel-apply-btn"]';
const SEL_OK_BTN = '[data-testid="node-editor"] [data-testid="panel-ok-btn"]';
const SEL_CLOSE_BTN = '[data-testid="node-editor"] [data-testid="panel-close-btn"]';

// Tab and field identifiers
const TAB = {
  BASIC: "basic",
  CONFIG: "config",
  RUNTIME: "runtime",
  NETWORK: "network",
  ADVANCED: "advanced"
} as const;

// Test values
const TEST_KIND = "linux";
const TEST_USER = "testuser";
const TEST_TOPOLOGY = "simple.clab.yml";
const SEL_KIND_FIELD = "#node-kind";

/**
 * Helper to reliably open node editor via double-click on a specific node
 * Uses node ID to fetch fresh bounding box immediately before clicking.
 */
async function openNodeEditorByNodeId(
  page: Page,
  topoViewerPage: {
    getNodeBoundingBox: (nodeId: string) => Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>;
    fit: () => Promise<void>;
  },
  nodeId: string,
  maxRetries = 3
): Promise<void> {
  const editorPanel = page.locator(SEL_NODE_EDITOR);
  const panelTab = page.locator('[data-testid="panel-tab-basic"]');
  const floatingContent = page.locator(".floating-panel-content");
  const collapsePanelButton = page.locator('[data-testid="floating-panel-collapse-btn"]');
  const closeEditorPanel = async () => {
    if (await editorPanel.isVisible()) {
      await page.locator(`${SEL_NODE_EDITOR} [data-testid="panel-close-btn"]`).click();
      await expect(editorPanel).toBeHidden({ timeout: 2000 });
    }
  };
  const collapseFloatingPanel = async () => {
    if (await floatingContent.isVisible()) {
      await collapsePanelButton.click();
      await expect(floatingContent).toBeHidden({ timeout: 2000 });
    }
  };
  const waitForStableNodeBox = async (nodeHandle: ReturnType<Page["locator"]>) => {
    let prev = await nodeHandle.boundingBox();
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(120);
      const next = await nodeHandle.boundingBox();
      if (!prev || !next) {
        prev = next;
        continue;
      }
      const stable =
        Math.abs(next.x - prev.x) < 1 &&
        Math.abs(next.y - prev.y) < 1 &&
        Math.abs(next.width - prev.width) < 1 &&
        Math.abs(next.height - prev.height) < 1;
      if (stable) return next;
      prev = next;
    }
    return prev;
  };

  const separateOverlappingNode = async () => {
    let moved = false;
    for (let i = 0; i < 2; i++) {
      const blockingId = await page.evaluate((targetId) => {
        const target = document.querySelector(`[data-id="${targetId}"]`) as HTMLElement | null;
        if (!target) return null;
        const targetRect = target.getBoundingClientRect();
        const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
        for (const node of nodes) {
          const id = node.getAttribute("data-id");
          if (!id || id === targetId) continue;
          const rect = (node as HTMLElement).getBoundingClientRect();
          const overlaps =
            targetRect.left < rect.right &&
            targetRect.right > rect.left &&
            targetRect.top < rect.bottom &&
            targetRect.bottom > rect.top;
          if (overlaps) return id;
        }
        return null;
      }, nodeId);

      if (!blockingId) break;

      const blockingHandle = page.locator(`[data-id="${blockingId}"]`);
      const blockingBox = await blockingHandle.boundingBox();
      if (!blockingBox) break;

      const startX = blockingBox.x + blockingBox.width / 2;
      const startY = blockingBox.y + blockingBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 120, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      moved = true;
    }
    return moved;
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await closeEditorPanel();
    await collapseFloatingPanel();
    if (attempt === 1) {
      await topoViewerPage.fit();
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector(`[data-id="${nodeId}"]`, { timeout: 5000 });
    await page.waitForTimeout(150);

    const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
    await nodeHandle.scrollIntoViewIfNeeded();
    await expect(nodeHandle).toBeVisible({ timeout: 2000 });
    await separateOverlappingNode();

    const nodeBox = (await waitForStableNodeBox(nodeHandle)) ?? (await topoViewerPage.getNodeBoundingBox(nodeId));
    if (!nodeBox) {
      throw new Error(`Node ${nodeId} not found or has no bounding box`);
    }
    const centerX = nodeBox.x + nodeBox.width / 2;
    const centerY = nodeBox.y + nodeBox.height / 2;

    try {
      const hitsTarget = await page.evaluate(
        ({ x, y, id }) => {
          const el = document.elementFromPoint(x, y);
          return !!el?.closest(`[data-id="${id}"]`);
        },
        { x: centerX, y: centerY, id: nodeId }
      );
      if (!hitsTarget) {
        await separateOverlappingNode();
        continue;
      }
      await page.mouse.move(centerX, centerY);
      await page.mouse.click(centerX, centerY, { delay: 60 });
      await page.waitForTimeout(150);
      await page.mouse.dblclick(centerX, centerY, { delay: 80 });
    } catch {
      await separateOverlappingNode();
      continue;
    }

    try {
      await expect(editorPanel).toBeVisible({ timeout: 2000 });
      await expect(panelTab).toBeVisible({ timeout: 2000 });
      const nameInput = page.locator("#node-name");
      if ((await nameInput.count()) > 0) {
        await expect(nameInput).toHaveValue(nodeId, { timeout: 1000 });
      }
      return;
    } catch {
      await closeEditorPanel();
      if (attempt === maxRetries) {
        throw new Error(`Failed to open node editor after ${maxRetries} attempts for node ${nodeId}`);
      }
      await page.waitForTimeout(300);
    }
  }
}

type TabName = (typeof TAB)[keyof typeof TAB];

/**
 * Helper to navigate to a specific tab in the node editor
 */
async function navigateToTab(page: Page, tabName: TabName): Promise<void> {
  const tab = page.locator(`[data-testid="panel-tab-${tabName}"]`);
  await expect(tab).toBeVisible({ timeout: 2000 });
  await tab.click();
  await page.waitForTimeout(200);
}

/**
 * Helper to fill an input field and commit the value.
 * For FilterableDropdown inputs, we need to blur after filling to trigger the commit.
 */
async function fillField(page: Page, fieldId: string, value: string): Promise<void> {
  const field = page.locator(`#${fieldId}`);
  await field.clear();
  await field.fill(value);
  // Blur the field to trigger value commit (FilterableDropdown has 150ms blur timeout)
  await field.blur();
  await page.waitForTimeout(200);
}

/**
 * Helper to check a checkbox
 */
async function setCheckbox(page: Page, fieldId: string, checked: boolean): Promise<void> {
  const checkbox = page.locator(`#${fieldId}`);
  const isChecked = await checkbox.isChecked();
  if (isChecked !== checked) {
    // Use force click since the checkbox might be partially obscured by floating panel
    await checkbox.click({ force: true });
  }
}

/**
 * Helper to select an option from a select field
 */
async function selectOption(page: Page, fieldId: string, value: string): Promise<void> {
  const select = page.locator(`#${fieldId}`);
  await select.selectOption(value);
}

/**
 * Node Editor Persistence E2E Tests
 *
 * Tests that node editor changes are properly:
 * 1. Saved to YAML file
 * 2. Reflected in UI after reopening the editor
 * 3. Persisted after page reload
 */
test.describe("Node Editor Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
  });

  test("kind field persists after applying and reopening editor", async ({
    page,
    topoViewerPage
  }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds.length).toBeGreaterThan(0);
    const nodeId = nodeIds[0];

    // Open editor and change kind
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain(`kind: ${TEST_KIND}`);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await expect(page.locator(SEL_NODE_EDITOR)).toBeHidden({ timeout: 3000 });

    // Reopen editor
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.BASIC);

    // Verify kind is still linux
    const kindField = page.locator(SEL_KIND_FIELD);
    await expect(kindField).toHaveValue(TEST_KIND);
  });

  test("startup-config field persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and change startup-config
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.CONFIG);
    await fillField(page, "node-startup-config", "/path/to/config.txt");

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain("startup-config: /path/to/config.txt");

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await expect(page.locator(SEL_NODE_EDITOR)).toBeHidden({ timeout: 3000 });

    // Verify YAML file contains startup-config
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("startup-config");
    expect(yamlContent).toContain("/path/to/config.txt");
  });

  test("user field persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set user
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", TEST_USER);

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(TEST_TOPOLOGY), { timeout: 5000 })
      .toContain(`user: ${TEST_USER}`);

    // Verify YAML file contains user
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain(`user: ${TEST_USER}`);
  });

  test("multiple fields persist after save", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);

    // Set multiple fields across tabs
    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);
    await fillField(page, "node-image", "alpine:latest");

    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", "root");

    await navigateToTab(page, TAB.NETWORK);
    await fillField(page, "node-mgmt-ipv4", "172.20.20.10");

    await navigateToTab(page, TAB.ADVANCED);
    await fillField(page, "node-memory", "512m");

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
        return (
          yaml.includes(`kind: ${TEST_KIND}`) &&
          yaml.includes("image: alpine:latest") &&
          yaml.includes("user: root") &&
          yaml.includes("mgmt-ipv4: 172.20.20.10") &&
          yaml.includes("memory: 512m")
        );
      }, { timeout: 5000 })
      .toBe(true);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await expect(page.locator(SEL_NODE_EDITOR)).toBeHidden({ timeout: 3000 });

    // Reopen editor and verify all fields
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await expect(page.locator(SEL_KIND_FIELD)).toHaveValue(TEST_KIND);
    await expect(page.locator("#node-image")).toHaveValue("alpine:latest");

    await navigateToTab(page, TAB.RUNTIME);
    await expect(page.locator("#node-user")).toHaveValue("root");

    await navigateToTab(page, TAB.NETWORK);
    await expect(page.locator("#node-mgmt-ipv4")).toHaveValue("172.20.20.10");

    await navigateToTab(page, TAB.ADVANCED);
    await expect(page.locator("#node-memory")).toHaveValue("512m");
  });

  test("restart-policy persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set restart-policy
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.RUNTIME);
    await selectOption(page, "node-restart-policy", "always");

    // Click OK (save and close)
    await page.locator(SEL_OK_BTN).click();
    await page.waitForTimeout(500);

    // Verify YAML file contains restart-policy
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("restart-policy: always");
  });

  test("enforce-startup-config checkbox persists", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set enforce-startup-config
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.CONFIG);
    await setCheckbox(page, "node-enforce-startup-config", true);

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Close editor
    await page.locator(SEL_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    // Reopen editor and verify checkbox is checked
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.CONFIG);
    await expect(page.locator("#node-enforce-startup-config")).toBeChecked();

    // Verify YAML file contains enforce-startup-config
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("enforce-startup-config: true");
  });

  test("network-mode persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set network-mode
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.NETWORK);
    await selectOption(page, "node-network-mode", "host");

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Verify YAML file contains network-mode
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("network-mode: host");
  });

  test("image-pull-policy persists to YAML", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set image-pull-policy
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);
    await navigateToTab(page, TAB.ADVANCED);
    await selectOption(page, "node-image-pull-policy", "always");

    // Click Apply
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Verify YAML file contains image-pull-policy
    const yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("image-pull-policy: always");
  });

  test("values persist after page reload", async ({ page, topoViewerPage }) => {
    const nodeIds = await topoViewerPage.getNodeIds();
    const nodeId = nodeIds[0];

    // Open editor and set multiple fields
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await fillField(page, "node-kind", TEST_KIND);

    await navigateToTab(page, TAB.RUNTIME);
    await fillField(page, "node-user", "admin");

    // Click OK (save and close)
    await page.locator(SEL_OK_BTN).click();
    await page.waitForTimeout(500);

    // Reload the page (re-navigate to file)
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();
    await page.waitForTimeout(500);

    // Get node IDs again (might have changed order)
    const newNodeIds = await topoViewerPage.getNodeIds();
    expect(newNodeIds).toContain(nodeId);

    // Open editor and verify fields persisted
    await openNodeEditorByNodeId(page, topoViewerPage, nodeId);

    await navigateToTab(page, TAB.BASIC);
    await expect(page.locator(SEL_KIND_FIELD)).toHaveValue(TEST_KIND);

    await navigateToTab(page, TAB.RUNTIME);
    await expect(page.locator("#node-user")).toHaveValue("admin");
  });
});
