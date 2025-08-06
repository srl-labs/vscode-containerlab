const esbuild = require('esbuild');
const fs = require('fs-extra');
const path = require('path');

async function build() {
  // Copy HTML template files to dist
  const templateSrcDir = path.join(__dirname, 'src/topoViewerTs/webview-ui/html-static/template');
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
  const editorTemplateSrcDir = path.join(__dirname, 'src/topoViewerEditor/webview-ui/template');
  
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