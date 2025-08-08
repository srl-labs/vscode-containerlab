const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

async function build() {
  // Copy HTML template files to dist
  const templateSrcDir = path.join(__dirname, 'src/topoViewer/view/webview-ui/html-static/template');
  const templateDestDir = path.join(__dirname, 'dist');
  
  // Copy main template
  await fs.copy(
    path.join(templateSrcDir, 'vscodeHtmlTemplate.html'),
    path.join(templateDestDir, 'vscodeHtmlTemplate.html')
  );
  
  // Copy partials directory
  await fs.copy(
    path.join(templateSrcDir, 'partials'),
    path.join(templateDestDir, 'partials')
  );

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

  // Copy CSS files
  const cssDir = path.join(__dirname, 'src/topoViewer/view/webview-ui/html-static/css');
  const cssDestDir = path.join(__dirname, 'dist/css');
  
  if (fs.existsSync(cssDir)) {
    await fs.copy(cssDir, cssDestDir);
    console.log('CSS files copied to dist/css');
  }

  // Copy JS files
  const jsDir = path.join(__dirname, 'src/topoViewer/view/webview-ui/html-static/js');
  const jsDestDir = path.join(__dirname, 'dist/js');
  
  if (fs.existsSync(jsDir)) {
    await fs.copy(jsDir, jsDestDir);
    console.log('JS files copied to dist/js');
  }

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