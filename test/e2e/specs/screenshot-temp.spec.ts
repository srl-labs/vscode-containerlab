import { test } from '../fixtures/topoviewer';
import * as fs from 'fs';

test('compare', async ({ page, topoViewerPage }) => {
  await topoViewerPage.gotoFile('datacenter.clab.yml');
  await topoViewerPage.waitForCanvasReady();
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 1280, height: 800 });
  await topoViewerPage.fit();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="cytoscape-canvas"]').screenshot({ path: 'screenshots/canvas-datacenter.png' });

  await page.locator('[data-testid="navbar-capture"]').click();
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-testid="svg-export-panel"] button:has-text("Export SVG")').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const svg = Buffer.concat(await stream.toArray()).toString('utf-8');
  fs.mkdirSync('screenshots', { recursive: true });
  fs.writeFileSync('screenshots/exported-datacenter.svg', svg);

  await page.setContent(`<!DOCTYPE html><html><head><style>body{margin:0;background:#1a1a1a;}</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" /></body></html>`);
  await page.waitForTimeout(500);
  await page.locator('img').screenshot({ path: 'screenshots/rendered-svg-img.png' });
});
