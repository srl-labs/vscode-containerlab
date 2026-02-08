import { test, expect } from "../fixtures/topoviewer";

const SIMPLE_FILE = "simple.clab.yml";

// Test selectors for the new MUI Dialog-based lab settings
const SEL_LAB_SETTINGS_BTN = '[data-testid="navbar-lab-settings"]';
const SEL_LAB_SETTINGS_MODAL = '[data-testid="lab-settings-modal"]';
const SEL_LAB_SETTINGS_CLOSE_BTN = '[data-testid="lab-settings-close-btn"]';
const SEL_LAB_SETTINGS_TAB_BASIC = '[data-testid="lab-settings-tab-basic"]';
const SEL_LAB_SETTINGS_TAB_MGMT = '[data-testid="lab-settings-tab-mgmt"]';
const SEL_LAB_SETTINGS_SAVE_BTN = '[data-testid="lab-settings-save-btn"]';

const LABEL_CONTAINER_NAME_PREFIX = "Container Name Prefix";

const ATTR_ARIA_SELECTED = "aria-selected";
const ARIA_TRUE = "true";
const ARIA_FALSE = "false";

/**
 * Lab Settings Modal E2E Tests (MUI Dialog version)
 *
 * In the new MUI design, lab settings are shown in a Dialog (modal)
 * with tabs for Basic and Management settings.
 */
test.describe("Lab Settings Modal", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  async function openModal(page: any) {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);
    const modal = page.locator(SEL_LAB_SETTINGS_MODAL);
    await expect(modal).toBeVisible();
    return modal;
  }

  function formControlByLabel(modal: any, labelText: string) {
    return modal.locator(`.MuiFormControl-root:has(label:has-text("${labelText}"))`).first();
  }

  function muiSelectTriggerByLabel(modal: any, labelText: string) {
    // Prefer MUI Select's internal trigger element; fall back to ARIA roles.
    const formControl = formControlByLabel(modal, labelText);
    return formControl
      .locator("[role=\"combobox\"],[role=\"button\"],.MuiSelect-select,[aria-haspopup=\"listbox\"]")
      .first();
  }

  async function expectMuiSelectDisabled(modal: any, labelText: string) {
    const trigger = muiSelectTriggerByLabel(modal, labelText);
    await expect
      .poll(async () => {
        const ariaDisabled = await trigger.getAttribute("aria-disabled");
        const tabIndex = await trigger.getAttribute("tabindex");
        const cls = (await trigger.getAttribute("class")) ?? "";
        return ariaDisabled === "true" || tabIndex === "-1" || cls.includes("Mui-disabled");
      })
      .toBe(true);
  }

  async function chooseOption(page: any, optionText: string | RegExp) {
    // MUI Select renders a listbox with role=option; some builds expose menuitem instead.
    const opt = page.getByRole("option", { name: optionText });
    if ((await opt.count()) > 0) return opt.first().click();
    return page.getByRole("menuitem", { name: optionText }).first().click();
  }

  test("opens lab settings modal via navbar button", async ({ page }) => {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    const modal = page.locator(SEL_LAB_SETTINGS_MODAL);
    await expect(modal).toBeVisible();
  });

  test("lab settings modal has correct title", async ({ page }) => {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    // DialogTitle contains "Lab Settings"
    const modal = page.locator(SEL_LAB_SETTINGS_MODAL);
    await expect(modal.locator("h2")).toHaveText("Lab Settings");
  });

  test("lab settings modal has Basic and Management tabs", async ({ page }) => {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    const basicTab = page.locator(SEL_LAB_SETTINGS_TAB_BASIC);
    const mgmtTab = page.locator(SEL_LAB_SETTINGS_TAB_MGMT);
    await expect(basicTab).toBeVisible();
    await expect(mgmtTab).toBeVisible();
  });

  test("Basic tab is selected by default", async ({ page }) => {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    const basicTab = page.locator(SEL_LAB_SETTINGS_TAB_BASIC);
    await expect(basicTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_TRUE);
  });

  test("can switch to Management tab", async ({ page }) => {
    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    const mgmtTab = page.locator(SEL_LAB_SETTINGS_TAB_MGMT);
    await mgmtTab.click();
    await page.waitForTimeout(200);

    await expect(mgmtTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_TRUE);
    const basicTab = page.locator(SEL_LAB_SETTINGS_TAB_BASIC);
    await expect(basicTab).toHaveAttribute(ATTR_ARIA_SELECTED, ARIA_FALSE);
  });

  test("shows current lab name in Basic tab", async ({ page }) => {
    const modal = await openModal(page);

    const labNameInput = modal.getByRole("textbox", { name: "Lab Name" });
    await expect(labNameInput).toBeVisible();

    const value = await labNameInput.inputValue();
    expect(value).toBe("simple");
  });

  test("can change lab name in Basic tab", async ({ page }) => {
    const modal = await openModal(page);
    const labNameInput = modal.getByRole("textbox", { name: "Lab Name" });

    await labNameInput.clear();
    await labNameInput.fill("test-lab");
    await expect(labNameInput).toHaveValue("test-lab");
  });

  test("Save button exists in edit mode", async ({ page }) => {
    await openModal(page);

    const saveBtn = page.locator(SEL_LAB_SETTINGS_SAVE_BTN);
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toHaveText("Save");
  });

  test("save button persists lab name to YAML", async ({ page, topoViewerPage }) => {
    const modal = await openModal(page);

    const labNameInput = modal.getByRole("textbox", { name: "Lab Name" });
    await labNameInput.clear();
    await labNameInput.fill("updated-lab");

    await page.locator(SEL_LAB_SETTINGS_SAVE_BTN).click();
    await page.waitForTimeout(500);

    // Modal should close after save
    await expect(modal).not.toBeVisible({ timeout: 3000 });

    // Verify YAML was updated
    const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(yaml).toContain("name: updated-lab");
  });

  test("closes lab settings modal with close button", async ({ page }) => {
    const modal = await openModal(page);

    await page.locator(SEL_LAB_SETTINGS_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test("closes lab settings modal with Escape key", async ({ page }) => {
    const modal = await openModal(page);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test("Save button is hidden when canvas is locked", async ({ page, topoViewerPage }) => {
    await topoViewerPage.lock();

    const modal = await openModal(page);

    const saveBtn = page.locator(SEL_LAB_SETTINGS_SAVE_BTN);
    await expect(saveBtn).not.toBeVisible();

    await expect(modal.getByRole("textbox", { name: "Lab Name" })).toBeDisabled();
    await expectMuiSelectDisabled(modal, LABEL_CONTAINER_NAME_PREFIX);
  });

  test("Save button is hidden in view mode", async ({ page, topoViewerPage }) => {
    await topoViewerPage.setViewMode();

    const modal = await openModal(page);

    const saveBtn = page.locator(SEL_LAB_SETTINGS_SAVE_BTN);
    await expect(saveBtn).not.toBeVisible();

    await expect(modal.getByRole("textbox", { name: "Lab Name" })).toBeDisabled();
    await expectMuiSelectDisabled(modal, LABEL_CONTAINER_NAME_PREFIX);
  });

  test("can change prefix type to custom and enter custom prefix", async ({ page }) => {
    const modal = await openModal(page);

    const prefixSelect = muiSelectTriggerByLabel(modal, LABEL_CONTAINER_NAME_PREFIX);
    await prefixSelect.click();
    await chooseOption(page, /^Custom$/);

    const customPrefix = modal.getByRole("textbox", { name: "Custom Prefix" });
    await expect(customPrefix).toBeVisible();
    await customPrefix.fill("myprefix");
    await expect(customPrefix).toHaveValue("myprefix");
  });

  test("custom prefix input is hidden when prefix type is not custom", async ({ page }) => {
    const modal = await openModal(page);

    const prefixSelect = muiSelectTriggerByLabel(modal, LABEL_CONTAINER_NAME_PREFIX);
    await prefixSelect.click();
    // Option label is "Default (clab)"
    await chooseOption(page, /Default/i);

    await expect(modal.getByRole("textbox", { name: "Custom Prefix" })).not.toBeVisible();
  });

  test("Management tab shows network name field", async ({ page }) => {
    const modal = await openModal(page);

    await modal.locator(SEL_LAB_SETTINGS_TAB_MGMT).click();
    await page.waitForTimeout(200);

    await expect(modal.getByRole("textbox", { name: "Network Name" })).toBeVisible();
  });

  test("Management tab shows IPv4 and IPv6 subnet selectors", async ({ page }) => {
    const modal = await openModal(page);

    await modal.locator(SEL_LAB_SETTINGS_TAB_MGMT).click();
    await page.waitForTimeout(200);

    await expect(muiSelectTriggerByLabel(modal, "IPv4 Subnet")).toBeVisible();
    await expect(muiSelectTriggerByLabel(modal, "IPv6 Subnet")).toBeVisible();
  });

  test("reopening modal preserves original data", async ({ page }) => {
    const modal = await openModal(page);
    const labNameInput = modal.getByRole("textbox", { name: "Lab Name" });
    const initialValue = await labNameInput.inputValue();
    expect(initialValue).toBe("simple");

    // Close and reopen
    await page.locator(SEL_LAB_SETTINGS_CLOSE_BTN).click();
    await page.waitForTimeout(300);

    await page.locator(SEL_LAB_SETTINGS_BTN).click();
    await page.waitForTimeout(300);

    const labNameInputAfter = page.locator(SEL_LAB_SETTINGS_MODAL).locator("input").first();
    const valueAfter = await labNameInputAfter.inputValue();
    expect(valueAfter).toBe("simple");
  });
});
