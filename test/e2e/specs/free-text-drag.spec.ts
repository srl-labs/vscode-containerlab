import { expect, test } from "../fixtures/topoviewer";

const DATACENTER_FILE = "datacenter.clab.yml";
const GIF_MARKDOWN =
  "![gif](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDVlNGdiODA5ZXhmcHp5ZDI1ZGo4bHc1ZHAyeTB0ZW03YzdmbHIzOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/TcdpZwYDPlWXC/giphy.gif)";

function positionChanged(
  before: { x: number; y: number } | undefined,
  after: { x: number; y: number } | undefined
): boolean {
  if (!before || !after) return false;
  return before.x !== after.x || before.y !== after.y;
}

test.describe("Free Text Dragging", () => {
  test("clicking free text opens the editor", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.waitForTimeout(500);
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const textElement = page.locator(`[data-id="${text!.id}"] .free-text-content`).first();
    await expect(textElement).toBeVisible();
    await textElement.click();

    const panel = page.locator('[data-testid="context-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Edit Text", { exact: true })).toBeVisible();
  });

  test("can drag a free text annotation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.waitForTimeout(500);
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const originalPosition = text?.position;
    expect(originalPosition).toBeDefined();

    // Reproduce user flow: click text first (opens editor), then drag it.
    const textElement = page.locator(`[data-id="${text!.id}"] .free-text-content`).first();
    await expect(textElement).toBeVisible();
    await textElement.click();
    await page.waitForTimeout(100);

    await topoViewerPage.dragNode(text!.id, { x: 120, y: 80 });

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
          const updated = after.freeTextAnnotations?.find((entry) => entry.id === text!.id);
          return positionChanged(originalPosition, updated?.position);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("can drag free text when markdown renders a link", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.waitForTimeout(500);
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const updated = {
      ...before,
      freeTextAnnotations: (before.freeTextAnnotations ?? []).map((entry) =>
        entry.id === text!.id ? { ...entry, text: "[Data Center](https://example.com)" } : entry
      )
    };
    await topoViewerPage.writeAnnotationsFile(DATACENTER_FILE, updated);
    await page.waitForTimeout(500);

    const textElement = page.locator(`[data-id="${text!.id}"] .free-text-content`).first();
    await expect(textElement.locator("a")).toBeVisible({ timeout: 5000 });

    const originalPosition = text?.position;
    expect(originalPosition).toBeDefined();

    const box = await textElement.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 80, {
      steps: 8
    });
    await page.mouse.up();

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
          const moved = after.freeTextAnnotations?.find((entry) => entry.id === text!.id);
          return positionChanged(originalPosition, moved?.position);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("can drag free text when pointer starts on markdown gif image", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.waitForTimeout(500);
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const updated = {
      ...before,
      freeTextAnnotations: (before.freeTextAnnotations ?? []).map((entry) =>
        entry.id === text!.id
          ? {
              ...entry,
              text: GIF_MARKDOWN,
              width: entry.width ?? 96,
              height: undefined
            }
          : entry
      )
    };
    await topoViewerPage.writeAnnotationsFile(DATACENTER_FILE, updated);
    await page.waitForTimeout(500);

    const originalPosition = text?.position;
    expect(originalPosition).toBeDefined();

    const gifImage = page.locator(`[data-id="${text!.id}"] .free-text-content img`).first();
    await expect(gifImage).toBeVisible({ timeout: 5000 });

    const box = await gifImage.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 80, {
      steps: 8
    });
    await page.mouse.up();

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
          const moved = after.freeTextAnnotations?.find((entry) => entry.id === text!.id);
          return positionChanged(originalPosition, moved?.position);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });

  test("can rotate free text when markdown gif image is selected", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    await page.waitForTimeout(500);
    await topoViewerPage.fit();
    await page.waitForTimeout(300);

    const pageErrors: string[] = [];
    const handlePageError = (error: Error) => {
      pageErrors.push(error.message);
    };
    page.on("pageerror", handlePageError);

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const initialRotation = text?.rotation ?? 0;
    const updated = {
      ...before,
      freeTextAnnotations: (before.freeTextAnnotations ?? []).map((entry) =>
        entry.id === text!.id
          ? {
              ...entry,
              text: GIF_MARKDOWN,
              width: entry.width ?? 120,
              height: entry.height ?? 74,
              rotation: entry.rotation ?? initialRotation
            }
          : entry
      )
    };
    await topoViewerPage.writeAnnotationsFile(DATACENTER_FILE, updated);
    await page.waitForTimeout(500);

    const textElement = page.locator(`[data-id="${text!.id}"] .free-text-content`).first();
    await expect(textElement.locator("img")).toBeVisible({ timeout: 5000 });
    await textElement.click();

    const rotationHandle = page
      .locator(`[data-id="${text!.id}"] [title="Drag to rotate (Shift for 15° snap)"]`)
      .first();
    await expect(rotationHandle).toBeVisible({ timeout: 5000 });

    const handleBox = await rotationHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 60, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
          const rotated = after.freeTextAnnotations?.find((entry) => entry.id === text!.id);
          return (rotated?.rotation ?? 0) !== initialRotation;
        },
        { timeout: 5000 }
      )
      .toBe(true);

    await expect(page.locator(".react-flow")).toBeVisible();
    const hasReactDepthError = pageErrors.some(
      (message) =>
        message.includes("Maximum update depth exceeded") ||
        message.includes("Minified React error #185")
    );
    expect(hasReactDepthError).toBe(false);
    page.off("pageerror", handlePageError);
  });

  test("legacy gif markdown free text is migrated with explicit height on load", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    const text = before.freeTextAnnotations?.[0];
    expect(text).toBeDefined();

    const legacyLike = {
      ...before,
      freeTextAnnotations: (before.freeTextAnnotations ?? []).map((entry) =>
        entry.id === text!.id
          ? {
              ...entry,
              text: GIF_MARKDOWN,
              width: 96,
              height: undefined
            }
          : entry
      )
    };
    await topoViewerPage.writeAnnotationsFile(DATACENTER_FILE, legacyLike);

    // Reload to trigger legacy migration path in the host.
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
          const migrated = after.freeTextAnnotations?.find((entry) => entry.id === text!.id);
          return typeof migrated?.height === "number" && Number.isFinite(migrated.height);
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });
});
