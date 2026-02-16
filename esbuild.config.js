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

  // Copy wireshark SVG
  const wiresharkSrc = path.join(
    __dirname,
    "src/reactTopoViewer/webview/assets/images/wireshark_bold.svg"
  );
  if (fs.existsSync(wiresharkSrc)) {
    await fs.promises.copyFile(wiresharkSrc, path.join(fontDir, "wireshark_bold.svg"));
  }

  // Monaco codicon font (used by Monaco UI widgets)
  const codiconSrc = path.join(
    __dirname,
    "node_modules/monaco-editor/min/vs/base/browser/ui/codicons/codicon/codicon.ttf"
  );
  if (fs.existsSync(codiconSrc)) {
    await fs.promises.copyFile(codiconSrc, path.join(fontDir, "codicon.ttf"));
  }
}

// Copy MapLibre CSP worker to dist for webview CSP compatibility
async function copyMapLibreWorker() {
  const srcPath = path.join(__dirname, "node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js");
  const destPath = path.join(__dirname, "dist/maplibre-gl-csp-worker.js");
  if (!fs.existsSync(srcPath)) return;
  await fs.promises.copyFile(srcPath, destPath);
}

// Build CSS with PostCSS
async function buildCss() {
  console.log("Building CSS with PostCSS...");
  execSync(
    "npx postcss src/reactTopoViewer/webview/styles/global.css -o dist/reactTopoViewerStyles.css",
    { stdio: "inherit" }
  );

  // Fix font paths - rewrite node_modules paths to webfonts/
  const cssPath = path.join(__dirname, "dist/reactTopoViewerStyles.css");
  let css = await fs.promises.readFile(cssPath, "utf8");

  // Handle maplibre-gl font references if any
  css = css.replace(
    /url\([^)]*node_modules\/maplibre-gl\/[^)]*\/([^/)]+\.(woff2?|ttf|eot))\)/g,
    "url(webfonts/$1)"
  );

  // Monaco codicon font reference (relative to editor.main.css)
  css = css.replace(
    /url\((\"|')?\.\.\/base\/browser\/ui\/codicons\/codicon\/codicon\.ttf(\")?\)/g,
    "url(webfonts/codicon.ttf)"
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

  const explorerWebviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/webviews/explorer/containerlabExplorerView.webview.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/containerlabExplorerView.js",
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

  const welcomeWebviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/webviews/welcome/welcomePage.webview.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/welcomePageWebview.js",
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

  const inspectWebviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/webviews/inspect/inspect.webview.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/inspectWebview.js",
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

  const nodeImpairmentsWebviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/webviews/nodeImpairments/nodeImpairments.webview.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/nodeImpairmentsWebview.js",
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

  const wiresharkVncWebviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: ["src/webviews/wiresharkVnc/wiresharkVnc.webview.tsx"],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/wiresharkVncWebview.js",
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

  // Build Monaco workers for webview (separate files for CSP-friendly worker-src)
  const monacoWorkersBuild = esbuild.build({
    ...commonOptions,
    entryPoints: {
      "monaco-editor-worker": "node_modules/monaco-editor/esm/vs/editor/editor.worker.js",
      "monaco-json-worker": "node_modules/monaco-editor/esm/vs/language/json/json.worker.js"
    },
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outdir: "dist",
    plugins: [ignoreCssPlugin]
  });

  // Run all builds in parallel
  await Promise.all([
    extensionBuild,
    webviewBuild,
    explorerWebviewBuild,
    welcomeWebviewBuild,
    inspectWebviewBuild,
    nodeImpairmentsWebviewBuild,
    wiresharkVncWebviewBuild,
    monacoWorkersBuild,
    copyFonts(),
    copyMapLibreWorker(),
    buildCss()
  ]);

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

    const explorerWebCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/webviews/explorer/containerlabExplorerView.webview.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/containerlabExplorerView.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    const welcomeWebCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/webviews/welcome/welcomePage.webview.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/welcomePageWebview.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    const inspectWebCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/webviews/inspect/inspect.webview.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/inspectWebview.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    const nodeImpairmentsWebCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/webviews/nodeImpairments/nodeImpairments.webview.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/nodeImpairmentsWebview.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    const wiresharkVncWebCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: ["src/webviews/wiresharkVnc/wiresharkVnc.webview.tsx"],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/wiresharkVncWebview.js",
      plugins: [ignoreCssPlugin],
      jsx: "automatic",
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".gif": "dataurl"
      }
    });

    const monacoWorkersCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: {
        "monaco-editor-worker": "node_modules/monaco-editor/esm/vs/editor/editor.worker.js",
        "monaco-json-worker": "node_modules/monaco-editor/esm/vs/language/json/json.worker.js"
      },
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outdir: "dist",
      plugins: [ignoreCssPlugin]
    });

    await Promise.all([
      extCtx.watch(),
      webCtx.watch(),
      explorerWebCtx.watch(),
      welcomeWebCtx.watch(),
      inspectWebCtx.watch(),
      nodeImpairmentsWebCtx.watch(),
      wiresharkVncWebCtx.watch(),
      monacoWorkersCtx.watch()
    ]);

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
