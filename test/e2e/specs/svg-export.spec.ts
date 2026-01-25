import * as fs from "fs";

import { test, expect } from "../fixtures/topoviewer";

const SIMPLE_FILE = "simple.clab.yml";
const DATACENTER_FILE = "datacenter.clab.yml";

// Annotation layer identifiers in exported SVG
const LAYER_GROUPS = "annotation-groups-layer";
const LAYER_SHAPES = "annotation-shapes-layer";
const LAYER_TEXT = "annotation-text-layer";

// Selectors for new UI design
const SEL_NAVBAR_CAPTURE = '[data-testid="navbar-capture"]';
const SEL_SVG_EXPORT_PANEL = '[data-testid="svg-export-panel"]';
const SEL_EXPORT_BTN = 'button:has-text("Export SVG")';

test.describe("SVG Export", () => {
  test("opens SVG export panel and shows options", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Click capture button
    const captureBtn = page.locator(SEL_NAVBAR_CAPTURE);
    await captureBtn.click();
    await page.waitForTimeout(300);

    // Check panel is visible
    const panel = page.locator(SEL_SVG_EXPORT_PANEL);
    await expect(panel).toBeVisible();

    // Check all expected controls are present within the panel (new UI)
    // Number inputs for Zoom and Padding
    await expect(panel.locator('input[type="number"]').first()).toBeVisible();
    // Background toggle buttons
    await expect(panel.locator('button:has-text("Transparent")')).toBeVisible();
    await expect(panel.locator('button:has-text("White")')).toBeVisible();
    // Filename input
    await expect(panel.locator('input[type="text"]')).toBeVisible();
    // Export button
    await expect(panel.locator(SEL_EXPORT_BTN)).toBeVisible();
  });

  test("exports SVG and verifies content", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toBe("topology.svg");

    // Read SVG content
    const stream = await download.createReadStream();
    const svgContent = await stream.toArray();
    const svgString = Buffer.concat(svgContent).toString("utf-8");

    // Verify basic SVG structure
    expect(svgString).toContain("<svg");
    expect(svgString).toContain("</svg>");

    // Log SVG for debugging
    console.log("=== Exported SVG (first 2000 chars) ===");
    console.log(svgString.substring(0, 2000));
  });

  test("exports SVG with annotations from datacenter topology", async ({
    page,
    topoViewerPage
  }) => {
    // Use datacenter.clab.yml which has pre-existing annotations:
    // - 6 text annotations (labels for layers and racks)
    // - 1 shape annotation (dashed rectangle)
    // - 6 group annotations (border, spine, leaf-a, leaf-b, servers-a, servers-b)
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify the file has annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    console.log("=== Datacenter annotations ===");
    console.log("Text annotations:", annotations.freeTextAnnotations?.length ?? 0);
    console.log("Shape annotations:", annotations.freeShapeAnnotations?.length ?? 0);
    console.log("Group annotations:", annotations.groupStyleAnnotations?.length ?? 0);

    expect(annotations.freeTextAnnotations?.length).toBeGreaterThan(0);

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Verify annotations section shows count (new UI shows "X annotations")
    const totalAnnotations =
      (annotations.freeTextAnnotations?.length ?? 0) +
      (annotations.freeShapeAnnotations?.length ?? 0) +
      (annotations.groupStyleAnnotations?.length ?? 0);

    // New UI shows "13 annotations" text
    const annotationsText = panel.locator(`text=${totalAnnotations} annotation`);
    await expect(annotationsText).toBeVisible();

    // Verify "Included" toggle is shown (annotations are included by default)
    await expect(panel.locator('button:has-text("Included")')).toBeVisible();

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const svgContent = await stream.toArray();
    const svgString = Buffer.concat(svgContent).toString("utf-8");

    // Log SVG structure for debugging
    console.log("=== Exported SVG structure ===");
    console.log("SVG length:", svgString.length);
    console.log(`Has ${LAYER_GROUPS}:`, svgString.includes(LAYER_GROUPS));
    console.log(`Has ${LAYER_SHAPES}:`, svgString.includes(LAYER_SHAPES));
    console.log(`Has ${LAYER_TEXT}:`, svgString.includes(LAYER_TEXT));

    // Verify annotation layers exist
    expect(svgString).toContain(LAYER_GROUPS);
    expect(svgString).toContain(LAYER_SHAPES);
    expect(svgString).toContain(LAYER_TEXT);

    // Verify groups are rendered (should have annotation-group class)
    expect(svgString).toContain("annotation-group");

    // Verify shapes are rendered
    expect(svgString).toContain("annotation-shape");

    // Verify text annotations are rendered (foreignObject for markdown)
    expect(svgString).toContain("foreignObject");

    // Verify specific content from annotations
    expect(svgString).toContain("Data Center West"); // Title text
    expect(svgString).toContain("Border Layer"); // Layer label

    // Verify transform is applied to annotation layers (matching React Flow transform)
    expect(svgString).toMatch(new RegExp(`${LAYER_GROUPS}.*transform="translate\\(`, "s"));

    // Log text layer content
    const textLayerRegex = new RegExp(`<g class="${LAYER_TEXT}"[^>]*>[\\s\\S]*?</g>\\s*</svg>`);
    const textLayerMatch = textLayerRegex.exec(svgString);
    console.log("=== Text layer content ===");
    console.log(textLayerMatch ? textLayerMatch[0].substring(0, 2000) : "Not found");
  });

  test("exports SVG with white background", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Click "White" toggle button for background (new UI)
    await panel.locator('button:has-text("White")').click();
    await page.waitForTimeout(100);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const stream3 = await download.createReadStream();
    const svgContent = await stream3.toArray();
    const svgString = Buffer.concat(svgContent).toString("utf-8");

    // Log SVG for debugging
    console.log("=== SVG with white background ===");
    console.log(svgString.substring(0, 3000));

    // Check for background rect with white fill
    console.log("=== Checking for background ===");
    console.log('Has fill="#ffffff":', svgString.includes('fill="#ffffff"'));
    console.log("Has white fill:", svgString.includes("#ffffff") || svgString.includes("white"));
  });

  test("exports SVG with custom filename", async ({ page, topoViewerPage }) => {
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Change filename (scoped to panel)
    const filenameInput = panel.locator('input[type="text"]');
    await filenameInput.clear();
    await filenameInput.fill("my-topology");

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("my-topology.svg");
  });

  test("annotation positions in exported SVG match canvas positions", async ({
    page,
    topoViewerPage
  }, testInfo) => {
    // This test verifies that annotations in the exported SVG are positioned
    // correctly relative to the nodes, matching what is shown on the canvas.
    await topoViewerPage.gotoFile(DATACENTER_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Wait for layout to stabilize
    await page.waitForTimeout(500);

    // Take a screenshot of the canvas for visual comparison
    const canvasScreenshot = await page.locator(".react-flow").screenshot();
    await testInfo.attach("canvas-screenshot", {
      body: canvasScreenshot,
      contentType: "image/png"
    });

    // Get node positions from canvas for reference
    const nodePositions = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return {};
      const positions: Record<string, { x: number; y: number }> = {};
      const nodes = rf.getNodes?.() ?? [];
      nodes.forEach((n: any) => {
        const role = n.data?.topoViewerRole;
        if (role && role !== "freeText" && role !== "freeShape") {
          positions[n.id] = n.position;
        }
      });
      return positions;
    });
    console.log("=== Node positions from canvas ===");
    console.log(JSON.stringify(nodePositions, null, 2));

    // Get annotation positions from the file
    const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
    console.log("=== Annotation positions from file ===");
    console.log(
      "Groups:",
      JSON.stringify(
        annotations.groupStyleAnnotations?.map((g) => ({
          id: g.id,
          name: g.name,
          position: (g as any).position
        })),
        null,
        2
      )
    );
    console.log(
      "Text:",
      JSON.stringify(
        annotations.freeTextAnnotations?.map((t) => ({
          id: t.id,
          text: t.text,
          position: t.position
        })),
        null,
        2
      )
    );

    // Get the React Flow transform (pan and zoom)
    const rfTransform = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return { pan: { x: 0, y: 0 }, zoom: 1 };
      const viewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
      return { pan: { x: viewport.x, y: viewport.y }, zoom: viewport.zoom };
    });
    console.log("=== React Flow transform ===");
    console.log(JSON.stringify(rfTransform, null, 2));

    // Open export panel
    await page.locator(SEL_NAVBAR_CAPTURE).click();
    await page.waitForTimeout(300);

    const panel = page.locator(SEL_SVG_EXPORT_PANEL);

    // Set up download listener
    const downloadPromise = page.waitForEvent("download");

    // Click export
    await panel.locator(SEL_EXPORT_BTN).click();

    // Get downloaded file
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const svgContent = await stream.toArray();
    const svgString = Buffer.concat(svgContent).toString("utf-8");

    // Save SVG for manual inspection
    const svgPath = testInfo.outputPath("exported-topology.svg");
    fs.writeFileSync(svgPath, svgString);
    await testInfo.attach("exported-svg", { path: svgPath, contentType: "image/svg+xml" });

    // Parse SVG to extract annotation positions
    console.log("=== SVG Analysis ===");

    // Extract the annotation layer transforms (may have multiple translates and scale)
    const groupsLayerMatch = new RegExp(`${LAYER_GROUPS}[^>]*transform="([^"]+)"`).exec(svgString);
    const textLayerMatch = new RegExp(`${LAYER_TEXT}[^>]*transform="([^"]+)"`).exec(svgString);

    if (groupsLayerMatch) {
      console.log("Groups layer transform:", groupsLayerMatch[1]);
    }
    if (textLayerMatch) {
      console.log("Text layer transform:", textLayerMatch[1]);
    }

    // Extract the React Flow main group transform
    const mainGroupMatch = /<g transform="(translate[^"]+scale\([^"]+)"/.exec(svgString);
    if (mainGroupMatch) {
      console.log("React Flow main group transform:", mainGroupMatch[1]);
    }

    // Extract group positions from SVG
    const groupRectRegex =
      /<g class="annotation-group"[^>]*>[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
    let match;
    console.log("=== Group rects in SVG ===");
    while ((match = groupRectRegex.exec(svgString)) !== null) {
      console.log(`Group rect: x=${match[1]}, y=${match[2]}, w=${match[3]}, h=${match[4]}`);
    }

    // Extract text annotation positions from SVG
    const textForeignRegex =
      /<g class="annotation-text"[^>]*>[\s\S]*?<foreignObject x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
    console.log("=== Text foreignObjects in SVG ===");
    while ((match = textForeignRegex.exec(svgString)) !== null) {
      console.log(`Text foreignObject: x=${match[1]}, y=${match[2]}, w=${match[3]}, h=${match[4]}`);
    }

    // Verify the transform values are reasonable
    expect(groupsLayerMatch).not.toBeNull();
    expect(textLayerMatch).not.toBeNull();
    expect(mainGroupMatch).not.toBeNull();

    // The annotation layer transforms should match the React Flow transform exactly
    // This ensures annotations are in the same coordinate space as React Flow nodes
    if (groupsLayerMatch && mainGroupMatch) {
      console.log("=== Transform comparison ===");
      console.log(`Annotation layer: ${groupsLayerMatch[1]}`);
      console.log(`React Flow layer: ${mainGroupMatch[1]}`);

      // They should be equal (annotations use the same transform as React Flow content)
      expect(groupsLayerMatch[1]).toBe(mainGroupMatch[1]);
      expect(textLayerMatch![1]).toBe(mainGroupMatch[1]);
    }

    // Verify SVG contains expected content
    expect(svgString).toContain("Data Center West");
    expect(svgString).toContain("Border Layer");
    expect(svgString).toContain(LAYER_GROUPS);
    expect(svgString).toContain(LAYER_TEXT);
  });
});
