const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

// Plugin to stub native .node files - ssh2 has JS fallbacks
const nativeNodeModulesPlugin = {
  name: "native-node-modules",
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, () => ({
      path: "noop",
      namespace: "native-node-empty"
    }));
    build.onLoad({ filter: /.*/, namespace: "native-node-empty" }, () => ({
      contents: "module.exports = {};"
    }));
  }
};

// Plugin to ignore CSS imports (we handle CSS separately with PostCSS)
const ignoreCssPlugin = {
  name: "ignore-css",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, () => ({
      path: "css-stub",
      namespace: "css-stub"
    }));
    build.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({
      contents: "",
      loader: "js"
    }));
  }
};

// Copy font files to dist
async function copyFonts() {
  const fontDir = path.join(__dirname, "dist/webfonts");
  await fs.promises.mkdir(fontDir, { recursive: true });

  const fontSources = [
    "node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2",
    "node_modules/@fortawesome/fontawesome-free/webfonts/fa-brands-400.woff2",
    "node_modules/@fortawesome/fontawesome-free/webfonts/fa-regular-400.woff2",
    "node_modules/@fortawesome/fontawesome-free/webfonts/fa-v4compatibility.woff2"
  ];

  for (const src of fontSources) {
    const srcPath = path.join(__dirname, src);
    const destPath = path.join(fontDir, path.basename(src));
    if (fs.existsSync(srcPath)) {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }

  // Copy wireshark SVG
  const wiresharkSrc = path.join(
    __dirname,
    "src/reactTopoViewer/webview/assets/images/wireshark_bold.svg"
  );
  if (fs.existsSync(wiresharkSrc)) {
    await fs.promises.copyFile(wiresharkSrc, path.join(fontDir, "wireshark_bold.svg"));
  }
}

// Copy MapLibre CSP worker to dist for webview CSP compatibility
async function copyMapLibreWorker() {
  const srcPath = path.join(__dirname, "node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js");
  const destPath = path.join(__dirname, "dist/maplibre-gl-csp-worker.js");
  if (!fs.existsSync(srcPath)) return;
  await fs.promises.copyFile(srcPath, destPath);
}

// Build CSS with PostCSS (Tailwind v4 requires proper postcss processing)
async function buildCss() {
  console.log("Building CSS with PostCSS...");
  execSync(
    "npx postcss src/reactTopoViewer/webview/styles/tailwind.css -o dist/reactTopoViewerStyles.css",
    { stdio: "inherit" }
  );

  // Fix font paths - rewrite node_modules paths to webfonts/
  const cssPath = path.join(__dirname, "dist/reactTopoViewerStyles.css");
  let css = await fs.promises.readFile(cssPath, "utf8");

  // Replace all node_modules font paths with relative webfonts/ paths
  css = css.replace(
    /url\([^)]*node_modules\/@fortawesome\/fontawesome-free\/webfonts\/([^)]+)\)/g,
    "url(webfonts/$1)"
  );

  // Also handle maplibre-gl font references if any
  css = css.replace(
    /url\([^)]*node_modules\/maplibre-gl\/[^)]*\/([^/)]+\.(woff2?|ttf|eot))\)/g,
    "url(webfonts/$1)"
  );

  await fs.promises.writeFile(cssPath, css);
}

async function build() {
  const isWatch = process.argv.includes("--watch");
  const isDev = process.argv.includes("--dev");

  // Ensure dist directory exists
  await fs.promises.mkdir(path.join(__dirname, "dist"), { recursive: true });

  // Common options
  const commonOptions = {
    bundle: true,
    minify: !isDev,
    treeShaking: true,
    sourcemap: isDev ? "inline" : false,
    logLevel: "info"
  };

  // Build extension (Node.js)
  const extensionBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/extension.ts"],
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    outfile: "dist/extension.js",
    plugins: [nativeNodeModulesPlugin]
  });

  // Build webview (Browser) - CSS handled separately
  const webviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/reactTopoViewer/webview/index.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/reactTopoViewerWebview.js",
    plugins: [ignoreCssPlugin],
    jsx: "automatic",
    loader: {
      ".svg": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".gif": "dataurl"
    },
    define: {
      "process.env.NODE_ENV": isDev ? '"development"' : '"production"'
    }
  });

  // Run all builds in parallel
  await Promise.all([extensionBuild, webviewBuild, copyFonts(), copyMapLibreWorker(), buildCss()]);

  console.log("Build complete!");

  // Watch mode
  if (isWatch) {
    const { watch } = require("chokidar");

    // Watch extension and webview with esbuild
    const extCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/extension.ts"],
      platform: "node",
      format: "cjs",
      external: ["vscode"],
      outfile: "dist/extension.js",
      plugins: [nativeNodeModulesPlugin]
    });

    const webCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/reactTopoViewer/webview/index.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/reactTopoViewerWebview.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    await Promise.all([extCtx.watch(), webCtx.watch()]);

    // Watch CSS files and rebuild
    const cssWatcher = watch("src/reactTopoViewer/webview/styles/**/*.css", {
      ignoreInitial: true
    });
    cssWatcher.on("change", () => {
      console.log("CSS changed, rebuilding...");
      buildCss();
    });

    console.log("Watching for changes...");
  }
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
