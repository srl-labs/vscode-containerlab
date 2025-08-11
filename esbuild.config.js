const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

async function build() {
  // Copy HTML template files to dist
  const templateDestDir = path.join(__dirname, 'dist');

  // Copy main template
  await fs.copy(
    path.join(__dirname, 'src/topoViewer/common/templates/main.html'),
    path.join(templateDestDir, 'main.html')
  );

  // Copy shared partials
  const sharedPartialsDir = path.join(__dirname, 'src/topoViewer/common/templates/partials');
  if (fs.existsSync(sharedPartialsDir)) {
    await fs.copy(sharedPartialsDir, path.join(templateDestDir, 'partials'));
  }

  // Copy editor-specific partials directory
  const editorPartialsSrcDir = path.join(__dirname, 'src/topoViewer/edit/templates/partials');
  if (fs.existsSync(editorPartialsSrcDir)) {
    await fs.copy(editorPartialsSrcDir, path.join(templateDestDir, 'editor-partials'));
    // Also copy as viewer-partials since we're unifying the modes
    await fs.copy(editorPartialsSrcDir, path.join(templateDestDir, 'viewer-partials'));
  }

  // Copy common images
  const commonImagesDir = path.join(__dirname, 'src/topoViewer/common/images');
  const imagesDestDir = path.join(__dirname, 'dist/images');
  
  if (fs.existsSync(commonImagesDir)) {
    await fs.copy(commonImagesDir, imagesDestDir);
    console.log('Common images copied to dist/images');
  }

  // Note: CSS and JS files are now bundled by webpack
  // No need to copy them separately from html-static

  // Build the extension
  await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    sourcemap: true
  });
  
  console.log('Build complete! HTML templates copied to dist/');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});