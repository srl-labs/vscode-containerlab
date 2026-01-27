import { test, expect } from "../fixtures/topoviewer";

const EMPTY_FILE = "empty.clab.yml";

const SEL_ADD_SHAPES_BTN = '[data-testid="floating-panel-add-shapes-btn"]';
const SEL_FREE_SHAPE_EDITOR = '[data-testid="free-shape-editor"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';
const SEL_RECTANGLE_OPTION = "text=Rectangle";

test.describe("Free Shape Annotations", () => {
  test("can create rectangle and persist to annotations file", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator(SEL_RECTANGLE_OPTION).click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected rectangle shape annotation to be persisted" }
      )
      .toBe(beforeCount + 1);

    const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const rectangle = after.freeShapeAnnotations?.find((s) => s.shapeType === "rectangle");
    expect(rectangle).toBeDefined();
  });

  test("can undo and redo rectangle creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    // Create a rectangle
    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator(SEL_RECTANGLE_OPTION).click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    // Wait for shape to be created
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected rectangle to be created" }
      )
      .toBe(beforeCount + 1);

    // Undo the rectangle creation
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify rectangle is removed
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected rectangle to be removed after undo" }
      )
      .toBe(beforeCount);

    // Redo the rectangle creation
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify rectangle is restored
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected rectangle to be restored after redo" }
      )
      .toBe(beforeCount + 1);
  });

  test("can undo and redo circle creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    // Create a circle
    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator("text=Circle").click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    // Wait for shape to be created
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected circle to be created" }
      )
      .toBe(beforeCount + 1);

    // Undo the circle creation
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify circle is removed
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected circle to be removed after undo" }
      )
      .toBe(beforeCount);
  });

  test("can undo and redo line creation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    // Create a line
    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator("text=Line").click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    // Wait for shape to be created
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected line to be created" }
      )
      .toBe(beforeCount + 1);

    // Undo the line creation
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify line is removed
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected line to be removed after undo" }
      )
      .toBe(beforeCount);
  });

  test("can undo and redo rectangle position change", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Create a rectangle first
    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator(SEL_RECTANGLE_OPTION).click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    // Wait for shape to be created and get its position
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          return after.freeShapeAnnotations?.length ?? 0;
        },
        { timeout: 5000, message: "Expected rectangle to be created" }
      )
      .toBe(1);

    const beforeDrag = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const originalPosition = beforeDrag.freeShapeAnnotations?.[0]?.position;
    expect(originalPosition).toBeDefined();

    // Find the shape node and drag it (React Flow nodes have class .react-flow__node)
    const shapeNode = page.locator(".react-flow__node.react-flow__node-free-shape-node").first();
    await expect(shapeNode).toBeVisible({ timeout: 3000 });

    // Get the bounding box for dragging
    const box = await shapeNode.boundingBox();
    expect(box).not.toBeNull();

    // Drag the shape to a new position (100px to the right, 50px down)
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2 + 50, {
      steps: 5
    });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify position changed
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const newPos = after.freeShapeAnnotations?.[0]?.position;
          return newPos && (newPos.x !== originalPosition!.x || newPos.y !== originalPosition!.y);
        },
        { timeout: 5000, message: "Expected position to change after drag" }
      )
      .toBe(true);

    const afterDrag = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const draggedPosition = afterDrag.freeShapeAnnotations?.[0]?.position;

    // Undo the position change
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    // Verify position reverted to original
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const pos = after.freeShapeAnnotations?.[0]?.position;
          // Allow small tolerance for snapping
          return (
            pos &&
            Math.abs(pos.x - originalPosition!.x) < 20 &&
            Math.abs(pos.y - originalPosition!.y) < 20
          );
        },
        { timeout: 5000, message: "Expected position to revert after undo" }
      )
      .toBe(true);

    // Redo the position change
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    // Verify position restored to dragged position
    await expect
      .poll(
        async () => {
          const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
          const pos = after.freeShapeAnnotations?.[0]?.position;
          // Allow small tolerance
          return (
            pos &&
            Math.abs(pos.x - draggedPosition!.x) < 20 &&
            Math.abs(pos.y - draggedPosition!.y) < 20
          );
        },
        { timeout: 5000, message: "Expected position to restore after redo" }
      )
      .toBe(true);
  });
});
