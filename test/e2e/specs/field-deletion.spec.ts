import type { Page } from "@playwright/test";

import { test, expect } from "../fixtures/topoviewer";

// Test selectors - ContextPanel-based
const SEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';
const SEL_CONTEXT_PANEL = '[data-testid="context-panel"]';

// Tab identifiers
const TAB = {
  CONFIG: "config",
  RUNTIME: "runtime",
  NETWORK: "network"
} as const;

type TabName = (typeof TAB)[keyof typeof TAB];

const TEST_TOPOLOGY = "simple.clab.yml";

/**
 * Click a node to open the editor in the ContextPanel
 */
async function clickNode(page: Page, nodeId: string): Promise<void> {
  const nodeHandle = page.locator(`[data-id="${nodeId}"]`);
  await nodeHandle.scrollIntoViewIfNeeded();
  await expect(nodeHandle).toBeVisible({ timeout: 3000 });
  const box = await nodeHandle.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

async function openNodeEditor(page: Page, nodeId: string): Promise<void> {
  await clickNode(page, nodeId);
  await expect(page.locator('[data-testid="panel-tab-basic"]')).toBeVisible({ timeout: 3000 });
}

async function navigateToTab(page: Page, tabName: TabName): Promise<void> {
  const tab = page.locator(`[data-testid="panel-tab-${tabName}"]`);
  await expect(tab).toBeVisible({ timeout: 2000 });
  await tab.click();
  await page.waitForTimeout(200);
}

async function clickAllRemoveButtons(page: Page): Promise<void> {
  const panel = page.locator(SEL_CONTEXT_PANEL);
  await expect(panel).toBeVisible({ timeout: 3000 });

  const removeButtons = panel.locator('button[aria-label="Remove"]');
  const count = await removeButtons.count();
  for (let i = count - 1; i >= 0; i--) {
    await removeButtons.nth(i).click();
    await page.waitForTimeout(100);
  }
}

/**
 * Field Deletion E2E Tests (MUI ContextPanel version)
 *
 * Tests that clearing fields properly removes them from YAML.
 */
test.describe("Field Deletion from YAML", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
  });

  test("clearing string field removes it from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithUser = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      user: testuser
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithUser);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("user: testuser");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    const userField = page.locator("#node-user");
    await userField.clear();
    await userField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("user:");
  });

  test("clearing mgmt-ipv4 removes it from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithMgmt = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      mgmt-ipv4: 172.20.20.10
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithMgmt);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("mgmt-ipv4: 172.20.20.10");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.NETWORK);

    const mgmtField = page.locator("#node-mgmt-ipv4");
    await mgmtField.clear();
    await mgmtField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("mgmt-ipv4:");
  });

  test("deleting labels removes them from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithLabels = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      labels:
        env: production
        team: network
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithLabels);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("labels:");
    expect(yamlContent).toContain("env: production");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    await clickAllRemoveButtons(page);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(700);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("labels:");
    expect(srl1Section).not.toContain("env:");
    expect(srl1Section).not.toContain("team:");
  });

  test("deleting env variables removes them from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithEnv = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      env:
        FOO: bar
        BAZ: qux
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithEnv);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("env:");
    expect(yamlContent).toContain("FOO: bar");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    await clickAllRemoveButtons(page);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(700);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("env:");
    expect(srl1Section).not.toContain("FOO:");
    expect(srl1Section).not.toContain("BAZ:");
  });

  test("UI updates immediately after Apply without requiring reload", async ({
    page,
    topoViewerPage
  }) => {
    // Regression: deleted dynamic-list entries should not reappear after Apply.
    const yamlWithEnv = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      env:
        TEST_VAR: test_value
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;

    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithEnv);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    const panel = page.locator(SEL_CONTEXT_PANEL);
    await expect(panel).toBeVisible({ timeout: 3000 });

    const removeButtons = panel.locator('button[aria-label="Remove"]');
    await expect(removeButtons).toHaveCount(1);
    await removeButtons.first().click();
    await page.waitForTimeout(100);
    await expect(removeButtons).toHaveCount(0);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(500);

    // Key regression check: Apply should not resurrect deleted rows.
    await expect(removeButtons).toHaveCount(0);

    const yaml = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yaml.split("srl2:")[0];
    expect(srl1Section).not.toContain("env:");
    expect(srl1Section).not.toContain("TEST_VAR");
  });

  test("deleting binds removes them from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithBinds = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      binds:
        - ./foo:/bar
        - ./a:/b:ro
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithBinds);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("binds:");
    expect(yamlContent).toContain("./foo:/bar");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.CONFIG);

    await clickAllRemoveButtons(page);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(700);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("binds:");
    expect(srl1Section).not.toContain("./foo:/bar");
  });

  test("unchecking auto-remove checkbox removes it from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithAutoRemove = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      auto-remove: true
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithAutoRemove);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("auto-remove: true");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    // Uncheck and apply
    await page.locator("#node-auto-remove").setChecked(false);
    await page.waitForTimeout(200);
    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(700);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("auto-remove:");
  });

  test("clearing startup-delay number field removes it from YAML", async ({ page, topoViewerPage }) => {
    const yamlWithStartupDelay = `name: simple
topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
      startup-delay: 15
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
  links:
    - endpoints: ["srl1:e1-1", "srl2:e1-1"]
`;
    await topoViewerPage.writeYamlFile(TEST_TOPOLOGY, yamlWithStartupDelay);
    await topoViewerPage.gotoFile(TEST_TOPOLOGY);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
    await topoViewerPage.fit();

    let yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    expect(yamlContent).toContain("startup-delay: 15");

    await openNodeEditor(page, "srl1");
    await navigateToTab(page, TAB.RUNTIME);

    const delayField = page.locator("#node-startup-delay");
    await delayField.clear();
    await delayField.blur();
    await page.waitForTimeout(200);

    await page.locator(SEL_APPLY_BTN).click();
    await page.waitForTimeout(700);

    yamlContent = await topoViewerPage.getYamlFromFile(TEST_TOPOLOGY);
    const srl1Section = yamlContent.split("srl2:")[0];
    expect(srl1Section).not.toContain("startup-delay:");
  });
});
