import { test, expect } from "../fixtures/topoviewer";
import { rightClick } from "../helpers/react-flow-helpers";

const EMPTY_FILE = "empty.clab.yml";

const SEL_CONTEXT_MENU = '[data-testid="context-menu"]';
const SEL_ADD_SHAPE_ITEM = '[data-testid="context-menu-item-add-shape"]';
const SEL_RECTANGLE_ITEM = '[data-testid="context-menu-item-add-shape-rectangle"]';
const SEL_CIRCLE_ITEM = '[data-testid="context-menu-item-add-shape-circle"]';
const SEL_LINE_ITEM = '[data-testid="context-menu-item-add-shape-line"]';

async function addShapeViaContextMenu(
  page: Parameters<typeof rightClick>[0],
  topoViewerPage: { getCanvas: () => ReturnType<Parameters<typeof rightClick>[0]["locator"]> },
  menuItemSelector: string,
  offset: { x: number; y: number } = { x: 150, y: 150 }
): Promise<void> {
  const canvasBox = await topoViewerPage.getCanvas().boundingBox();
  if (!canvasBox) throw new Error("Canvas not found");
  await rightClick(page, canvasBox.x + offset.x, canvasBox.y + offset.y);
  const contextMenu = page.locator(SEL_CONTEXT_MENU);
  await expect(contextMenu).toBeVisible();
  const addShapeItem = page.locator(SEL_ADD_SHAPE_ITEM);
  await expect(addShapeItem).toBeVisible();
  await addShapeItem.hover();
  await expect(page.locator(menuItemSelector)).toBeVisible();
  await page.locator(menuItemSelector).click();
  await expect(contextMenu).not.toBeVisible();
  await page.waitForTimeout(200);
}

async function dismissEditorIfAny(page: Parameters<typeof rightClick>[0]): Promise<void> {
  // Some shape creations may open an editor in the context panel; Escape should close it safely.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

async function getFreeShapeCount(topoViewerPage: any): Promise<number> {
  const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
  return ann.freeShapeAnnotations?.length ?? 0;
}

/**
 * Free Shape Annotations E2E Tests (MUI version)
 *
 * Tests creating shape annotations via the context menu.
 */
test.describe("Free Shape Annotations", () => {
  test("can create rectangle and persist to annotations file", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    await addShapeViaContextMenu(page, topoViewerPage, SEL_RECTANGLE_ITEM);

    await dismissEditorIfAny(page);

    await expect
      .poll(async () => {
        const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return after.freeShapeAnnotations?.length ?? 0;
      }, { timeout: 5000 })
      .toBe(beforeCount + 1);
  });

  test("can create circle via context menu", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    await addShapeViaContextMenu(page, topoViewerPage, SEL_CIRCLE_ITEM, { x: 200, y: 200 });

    await dismissEditorIfAny(page);

    await expect
      .poll(async () => {
        const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return after.freeShapeAnnotations?.length ?? 0;
      }, { timeout: 5000 })
      .toBe(beforeCount + 1);
  });

  test("undo removes created shape", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    await addShapeViaContextMenu(page, topoViewerPage, SEL_RECTANGLE_ITEM, { x: 250, y: 250 });
    await dismissEditorIfAny(page);

    // Verify shape was created
    await expect
      .poll(async () => {
        return await getFreeShapeCount(topoViewerPage);
      }, { timeout: 5000 })
      .toBe(beforeCount + 1);

    // Undo
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    // Verify shape was removed
    await expect
      .poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 })
      .toBe(beforeCount);
  });

  test("can undo and redo rectangle creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const beforeCount = await getFreeShapeCount(topoViewerPage);

    await addShapeViaContextMenu(page, topoViewerPage, SEL_RECTANGLE_ITEM, { x: 150, y: 150 });
    await dismissEditorIfAny(page);

    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );

    await topoViewerPage.undo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount
    );

    await topoViewerPage.redo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );
  });

  test("can undo and redo circle creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const beforeCount = await getFreeShapeCount(topoViewerPage);

    await addShapeViaContextMenu(page, topoViewerPage, SEL_CIRCLE_ITEM, { x: 200, y: 200 });
    await dismissEditorIfAny(page);

    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );

    await topoViewerPage.undo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount
    );

    await topoViewerPage.redo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );
  });

  test("can undo and redo line creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const beforeCount = await getFreeShapeCount(topoViewerPage);

    await addShapeViaContextMenu(page, topoViewerPage, SEL_LINE_ITEM, { x: 220, y: 140 });
    await dismissEditorIfAny(page);

    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );

    await topoViewerPage.undo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount
    );

    await topoViewerPage.redo();
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(
      beforeCount + 1
    );
  });

  test("can undo and redo rectangle position change", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Create exactly one rectangle.
    await addShapeViaContextMenu(page, topoViewerPage, SEL_RECTANGLE_ITEM, { x: 120, y: 120 });
    await dismissEditorIfAny(page);
    await expect.poll(async () => await getFreeShapeCount(topoViewerPage), { timeout: 5000 }).toBe(1);

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const originalPos = before.freeShapeAnnotations?.[0]?.position;
    expect(originalPos).toBeDefined();

    const shapeNode = page.locator(".react-flow__node.react-flow__node-free-shape-node").first();
    await expect(shapeNode).toBeVisible({ timeout: 5000 });
    const box = await shapeNode.boundingBox();
    expect(box).not.toBeNull();

    // Drag the shape.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 60, {
      steps: 8
    });
    await page.mouse.up();

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const pos = after.freeShapeAnnotations?.[0]?.position;
          if (!pos || !originalPos) return false;
          return pos.x !== originalPos.x || pos.y !== originalPos.y;
        },
        { timeout: 5000 }
      )
      .toBe(true);

    const afterDrag = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const draggedPos = afterDrag.freeShapeAnnotations?.[0]?.position;
    expect(draggedPos).toBeDefined();

    // Undo drag, expect near original (snapping tolerance).
    await topoViewerPage.undo();
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const pos = after.freeShapeAnnotations?.[0]?.position;
          if (!pos || !originalPos) return false;
          return Math.abs(pos.x - originalPos.x) < 20 && Math.abs(pos.y - originalPos.y) < 20;
        },
        { timeout: 5000 }
      )
      .toBe(true);

    // Redo drag, expect near dragged.
    await topoViewerPage.redo();
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const pos = after.freeShapeAnnotations?.[0]?.position;
          if (!pos || !draggedPos) return false;
          return Math.abs(pos.x - draggedPos.x) < 20 && Math.abs(pos.y - draggedPos.y) < 20;
        },
        { timeout: 5000 }
      )
      .toBe(true);
  });
});
