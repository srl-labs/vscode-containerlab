import { test, expect } from '../fixtures/topoviewer';

const SIMPLE_FILE = 'simple.clab.yml';
const DATACENTER_FILE = 'datacenter.clab.yml';

// Selectors
const SEL_NAVBAR_CAPTURE = '[data-testid="navbar-capture"]';
const SEL_SVG_EXPORT_PANEL = '[data-testid="svg-export-panel"]';
const SEL_EXPORT_BTN = '.btn:has-text("Export")';

test.describe('SVG Export', () => {
  test('opens SVG export panel and shows options', async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Click capture button
    const captureBtn = page.locator(SEL_NAVBAR_CAPTURE);
    await captureBtn.click();
    await page.waitForTimeout(300);

    // Check panel is visible
    const panel = page.locator(SEL_SVG_EXPORT_PANEL);
    await expect(panel).toBeVisible();

    // Check all expected controls are present within the panel
    await expect(panel.locator('input[type="checkbox"]')).toBeVisible();
    await expect(panel.locator('select')).toBeVisible();
    await expect(panel.locator('input[type="text"]')).toBeVisible();
    await expect(panel.locator(SEL_EXPORT_BTN)).toBeVisible();
  });

  test('exports SVG and verifies content', async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Set up download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toBe('topology.svg');

    // Read SVG content
    const stream = await download.createReadStream();
    const svgContent = await stream.toArray();
    const svgString = Buffer.concat(svgContent).toString('utf-8');

    // Verify basic SVG structure
    expect(svgString).toContain('<svg');
    expect(svgString).toContain('</svg>');

    // Log SVG for debugging
    console.log('=== Exported SVG (first 2000 chars) ===');
    console.log(svgString.substring(0, 2000));
  });

  test('exports SVG with annotations from datacenter topology', async ({ page, topoViewerPage }) => {
    // Use datacenter.clab.yml which has pre-existing annotations:
    // - 6 text annotations (labels for layers and racks)
    // - 1 shape annotation (dashed rectangle)
    // - 6 group annotations (border, spine, leaf-a, leaf-b, servers-a, servers-b)
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify the file has annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    console.log('=== Datacenter annotations ===');
    console.log('Text annotations:', annotations.freeTextAnnotations?.length ?? 0);
    console.log('Shape annotations:', annotations.freeShapeAnnotations?.length ?? 0);
    console.log('Group annotations:', annotations.groupStyleAnnotations?.length ?? 0);

    expect(annotations.freeTextAnnotations?.length).toBeGreaterThan(0);

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Verify annotations checkbox shows count (should show total count)
    const totalAnnotations =
      (annotations.freeTextAnnotations?.length ?? 0) +
      (annotations.freeShapeAnnotations?.length ?? 0) +
      (annotations.groupStyleAnnotations?.length ?? 0);

    const includeText = panel.locator(`text=Include (${totalAnnotations})`);
    await expect(includeText).toBeVisible();

    // Set up download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const svgContent = await stream.toArray();
    const svgString = Buffer.concat(svgContent).toString('utf-8');

    // Log SVG structure for debugging
    console.log('=== Exported SVG structure ===');
    console.log('SVG length:', svgString.length);
    console.log('Has annotation-groups-layer:', svgString.includes('annotation-groups-layer'));
    console.log('Has annotation-shapes-layer:', svgString.includes('annotation-shapes-layer'));
    console.log('Has annotation-text-layer:', svgString.includes('annotation-text-layer'));

    // Verify annotation layers exist
    expect(svgString).toContain('annotation-groups-layer');
    expect(svgString).toContain('annotation-shapes-layer');
    expect(svgString).toContain('annotation-text-layer');

    // Verify groups are rendered (should have annotation-group class)
    expect(svgString).toContain('annotation-group');

    // Verify shapes are rendered
    expect(svgString).toContain('annotation-shape');

    // Verify text annotations are rendered (foreignObject for markdown)
    expect(svgString).toContain('foreignObject');

    // Verify specific content from annotations
    expect(svgString).toContain('Data Center West'); // Title text
    expect(svgString).toContain('Border Layer'); // Layer label

    // Verify transform is applied to annotation layers (matching cytoscape transform)
    expect(svgString).toMatch(/annotation-groups-layer.*transform="translate\(/s);

    // Log text layer content
    const textLayerRegex = /<g class="annotation-text-layer"[^>]*>[\s\S]*?<\/g>\s*<\/svg>/;
    const textLayerMatch = textLayerRegex.exec(svgString);
    console.log('=== Text layer content ===');
    console.log(textLayerMatch ? textLayerMatch[0].substring(0, 2000) : 'Not found');
  });

  test('exports SVG with white background', async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Select white background (scoped to panel)
    const bgSelect = panel.locator('select');
    await bgSelect.selectOption('white');

    // Set up download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const stream3 = await download.createReadStream();
    const svgContent = await stream3.toArray();
    const svgString = Buffer.concat(svgContent).toString('utf-8');

    // Log SVG for debugging
    console.log('=== SVG with white background ===');
    console.log(svgString.substring(0, 3000));

    // Check for background rect with white fill
    console.log('=== Checking for background ===');
    console.log('Has fill="#ffffff":', svgString.includes('fill="#ffffff"'));
    console.log('Has white fill:', svgString.includes('#ffffff') || svgString.includes('white'));
  });

  test('exports SVG with custom filename', async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Change filename (scoped to panel)
    const filenameInput = panel.locator('input[type="text"]');
    await filenameInput.clear();
    await filenameInput.fill('my-topology');

    // Set up download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('my-topology.svg');
  });
});
