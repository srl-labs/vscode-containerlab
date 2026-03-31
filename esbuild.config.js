const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const localClabUiRoot = path.resolve(__dirname, "../containerlab-gui/packages/ui");
const localClabUiDistRoot = path.join(localClabUiRoot, "dist");
const useLocalClabUi =
  process.env.CLAB_UI_SOURCE === "local" &&
  fs.existsSync(path.join(localClabUiDistRoot, "index.js"));
const clabUiEntry = (relativePath, packageSubpath) =>
  useLocalClabUi
    ? path.join(localClabUiDistRoot, relativePath)
    : require.resolve(packageSubpath);

const reactTopoViewerEntry = path.join(__dirname, "src/webviews/reactTopoViewer/entry.tsx");
const explorerWebviewEntry = path.join(__dirname, "src/webviews/explorer/entry.tsx");
const inspectWebviewEntry = path.join(__dirname, "src/webviews/inspect/entry.tsx");
const welcomeWebviewEntry = path.join(__dirname, "src/webviews/welcome/entry.tsx");
const nodeImpairmentsWebviewEntry = path.join(__dirname, "src/webviews/nodeImpairments/entry.tsx");
const wiresharkVncWebviewEntry = path.join(__dirname, "src/webviews/wiresharkVnc/entry.tsx");
const clabUiGlobalCss = clabUiEntry("styles/global.css", "@srl-labs/clab-ui/styles/global.css");

const localClabUiEntrypoints = new Map([
  ["@srl-labs/clab-ui", path.join(localClabUiDistRoot, "index.js")],
  ["@srl-labs/clab-ui/host", path.join(localClabUiDistRoot, "host/index.js")],
  ["@srl-labs/clab-ui/session", path.join(localClabUiDistRoot, "session/index.js")],
  ["@srl-labs/clab-ui/theme", path.join(localClabUiDistRoot, "theme/index.js")],
  ["@srl-labs/clab-ui/explorer", path.join(localClabUiDistRoot, "explorer/index.js")],
  ["@srl-labs/clab-ui/inspect", path.join(localClabUiDistRoot, "inspect/index.js")],
  ["@srl-labs/clab-ui/welcome", path.join(localClabUiDistRoot, "welcome/index.js")],
  [
    "@srl-labs/clab-ui/node-impairments",
    path.join(localClabUiDistRoot, "node-impairments/index.js")
  ],
  [
    "@srl-labs/clab-ui/wireshark-vnc",
    path.join(localClabUiDistRoot, "wireshark-vnc/index.js")
  ],
  [
    "@srl-labs/clab-ui/styles/global.css",
    path.join(localClabUiDistRoot, "styles/global.css")
  ]
]);

const clabUiLocalAliasPlugin = {
  name: "clab-ui-local-alias",
  setup(build) {
    if (!useLocalClabUi) {
      return;
    }

    build.onResolve({ filter: /^@srl-labs\/clab-ui(?:\/.*)?$/ }, (args) => {
      const resolved = localClabUiEntrypoints.get(args.path) ?? null;
      if (!resolved) {
        return null;
      }
      return { path: resolved };
    });
  }
};

const reactSingletonAliasPlugin = {
  name: "react-singleton-alias",
  setup(build) {
    const aliasTargets = new Map([
      ["react", require.resolve("react")],
      ["react/jsx-runtime", require.resolve("react/jsx-runtime")],
      ["react/jsx-dev-runtime", require.resolve("react/jsx-dev-runtime")],
      ["react-dom", require.resolve("react-dom")],
      ["react-dom/client", require.resolve("react-dom/client")]
    ]);

    build.onResolve(
      { filter: /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom|react-dom\/client)$/ },
      (args) => {
        const resolved = aliasTargets.get(args.path);
        return resolved ? { path: resolved } : null;
      }
    );
  }
};

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
  execSync(`npx postcss "${clabUiGlobalCss}" -o dist/reactTopoViewerStyles.css`, {
    stdio: "inherit"
  });

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
    plugins: [nativeNodeModulesPlugin, clabUiLocalAliasPlugin, reactSingletonAliasPlugin]
  });

  // Build webview (Browser) - CSS handled separately
  const webviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [reactTopoViewerEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/reactTopoViewerWebview.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
    entryPoints: [explorerWebviewEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/containerlabExplorerView.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
    entryPoints: [welcomeWebviewEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/welcomePageWebview.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
    entryPoints: [inspectWebviewEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/inspectWebview.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
    entryPoints: [nodeImpairmentsWebviewEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/nodeImpairmentsWebview.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
    entryPoints: [wiresharkVncWebviewEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/wiresharkVncWebview.js",
    plugins: [
      ignoreCssPlugin,
      clabUiLocalAliasPlugin,
      reactSingletonAliasPlugin
    ],
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
      plugins: [nativeNodeModulesPlugin, clabUiLocalAliasPlugin, reactSingletonAliasPlugin]
    });

    const webCtx = await esbuild.context({
      ...commonOptions,
      entryPoints: [reactTopoViewerEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/reactTopoViewerWebview.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      entryPoints: [explorerWebviewEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/containerlabExplorerView.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      entryPoints: [welcomeWebviewEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/welcomePageWebview.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      entryPoints: [inspectWebviewEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/inspectWebview.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      entryPoints: [nodeImpairmentsWebviewEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/nodeImpairmentsWebview.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      entryPoints: [wiresharkVncWebviewEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/wiresharkVncWebview.js",
      plugins: [
        ignoreCssPlugin,
        clabUiLocalAliasPlugin,
        reactSingletonAliasPlugin
      ],
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
      plugins: [ignoreCssPlugin, clabUiLocalAliasPlugin]
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
    const cssWatchRoot = useLocalClabUi
      ? path.join(localClabUiDistRoot, "styles")
      : path.dirname(clabUiGlobalCss);
    const cssWatcher = watch(path.join(cssWatchRoot, "**/*.css"), {
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
