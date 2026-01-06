import { test, expect } from '../fixtures/topoviewer';

const EMPTY_FILE = 'empty.clab.yml';

const SEL_ADD_SHAPES_BTN = '[data-testid="floating-panel-add-shapes-btn"]';
const SEL_FREE_SHAPE_EDITOR = '[data-testid="free-shape-editor"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';

test.describe('Free Shape Annotations', () => {
  test('can create rectangle and persist to annotations file', async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const before = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const beforeCount = before.freeShapeAnnotations?.length ?? 0;

    await page.locator(SEL_ADD_SHAPES_BTN).click();
    await page.waitForTimeout(200);
    await page.locator('text=Rectangle').click();
    await page.waitForTimeout(200);

    const canvasCenter = await topoViewerPage.getCanvasCenter();
    await page.mouse.click(canvasCenter.x + 150, canvasCenter.y);
    await page.waitForTimeout(200);

    const shapeEditor = page.locator(SEL_FREE_SHAPE_EDITOR);
    if (await shapeEditor.isVisible({ timeout: 1000 }).catch(() => false)) {
      await shapeEditor.locator(SEL_PANEL_OK_BTN).click();
      await page.waitForTimeout(200);
    }

    await expect.poll(
      async () => {
        const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return after.freeShapeAnnotations?.length ?? 0;
      },
      { timeout: 5000, message: 'Expected rectangle shape annotation to be persisted' }
    ).toBe(beforeCount + 1);

    const after = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const rectangle = after.freeShapeAnnotations?.find(s => s.shapeType === 'rectangle');
    expect(rectangle).toBeDefined();
  });
});

