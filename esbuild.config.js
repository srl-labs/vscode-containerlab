const esbuild = require('esbuild');

async function build() {
  // Plugin to stub native .node files - ssh2 has JS fallbacks
  const nativeNodeModulesPlugin = {
    name: 'native-node-modules',
    setup(build) {
      build.onResolve({ filter: /\.node$/ }, () => ({
        path: 'noop',
        namespace: 'native-node-empty',
      }));
      build.onLoad({ filter: /.*/, namespace: 'native-node-empty' }, () => ({
        contents: 'module.exports = {};',
      }));
    },
  };

  // Build the extension
  await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    minify: true,
    treeShaking: true,
    plugins: [nativeNodeModulesPlugin],
  });

  console.log('Build complete!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
