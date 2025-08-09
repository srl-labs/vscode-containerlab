const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

async function build() {
  // Copy HTML template files to dist
  const templateSrcDir = path.join(__dirname, 'src/topoViewer/view/webview-ui/template');
  const templateDestDir = path.join(__dirname, 'dist');
  
  // Copy main template
  await fs.copy(
    path.join(templateSrcDir, 'vscodeHtmlTemplate.html'),
    path.join(templateDestDir, 'vscodeHtmlTemplate.html')
  );
  
  // Copy viewer-specific partials directory
  await fs.copy(
    path.join(templateSrcDir, 'partials'),
    path.join(templateDestDir, 'partials')
  );

  // Copy shared partials
  const sharedPartialsDir = path.join(__dirname, 'src/topoViewer/common/template/partials');
  if (fs.existsSync(sharedPartialsDir)) {
    // Copy to viewer partials
    await fs.copy(
      sharedPartialsDir,
      path.join(templateDestDir, 'partials'),
      { overwrite: false } // Don't overwrite viewer-specific files
    );
    // Copy to editor partials
    await fs.copy(
      sharedPartialsDir,
      path.join(templateDestDir, 'editor-partials'),
      { overwrite: false } // Don't overwrite editor-specific files
    );
    console.log('Shared partials copied to dist/');
  }

  // Copy editor template files
  const editorTemplateSrcDir = path.join(__dirname, 'src/topoViewer/edit/webview-ui/template');
  
  if (fs.existsSync(path.join(editorTemplateSrcDir, 'vscodeHtmlTemplate.html'))) {
    await fs.copy(
      path.join(editorTemplateSrcDir, 'vscodeHtmlTemplate.html'),
      path.join(templateDestDir, 'editorHtmlTemplate.html')
    );
  }
  
  if (fs.existsSync(path.join(editorTemplateSrcDir, 'partials'))) {
    await fs.copy(
      path.join(editorTemplateSrcDir, 'partials'),
      path.join(templateDestDir, 'editor-partials')
    );
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