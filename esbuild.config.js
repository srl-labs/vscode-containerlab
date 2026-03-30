const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const localClabUiRoot = path.resolve(__dirname, "../containerlab-gui/packages/ui");
const useLocalClabUi =
  process.env.CLAB_UI_SOURCE === "local" &&
  fs.existsSync(path.join(localClabUiRoot, "src", "index.ts"));
const clabUiRoot = useLocalClabUi
  ? localClabUiRoot
  : path.dirname(path.dirname(require.resolve("@srl-labs/clab-ui")));
const clabUiEntry = (relativePath, packageSubpath) =>
  useLocalClabUi
    ? path.join(localClabUiRoot, "src", relativePath)
    : require.resolve(packageSubpath);

const clabUiMainEntry = clabUiEntry("entry.tsx", "@srl-labs/clab-ui/entry.tsx");
const clabUiExplorerEntry = clabUiEntry("explorer/entry.tsx", "@srl-labs/clab-ui/explorer/entry.tsx");
const clabUiInspectEntry = clabUiEntry("inspect/entry.tsx", "@srl-labs/clab-ui/inspect/entry.tsx");
const clabUiWelcomeEntry = clabUiEntry("welcome/entry.tsx", "@srl-labs/clab-ui/welcome/entry.tsx");
const clabUiNodeImpairmentsEntry = clabUiEntry(
  "node-impairments/entry.tsx",
  "@srl-labs/clab-ui/node-impairments/entry.tsx"
);
const clabUiWiresharkVncEntry = clabUiEntry(
  "wireshark-vnc/entry.tsx",
  "@srl-labs/clab-ui/wireshark-vnc/entry.tsx"
);
const clabUiGlobalCss = clabUiEntry("styles/global.css", "@srl-labs/clab-ui/styles/global.css");
const clabUiWiresharkSvg = clabUiEntry(
  "assets/images/wireshark_bold.svg",
  "@srl-labs/clab-ui/assets/images/wireshark_bold.svg"
);

function resolveLocalClabUiImport(importPath) {
  const subpath = importPath === "@srl-labs/clab-ui" ? "index" : importPath.slice("@srl-labs/clab-ui/".length);
  const candidateBases = [
    path.join(localClabUiRoot, "src", subpath),
    path.join(localClabUiRoot, "src", subpath, "index")
  ];
  const candidateExts = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];

  for (const base of candidateBases) {
    for (const ext of candidateExts) {
      const candidate = `${base}${ext}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return null;
}

const clabUiLocalAliasPlugin = {
  name: "clab-ui-local-alias",
  setup(build) {
    if (!useLocalClabUi) {
      return;
    }

    build.onResolve({ filter: /^@srl-labs\/clab-ui(?:\/.*)?$/ }, (args) => {
      const resolved = resolveLocalClabUiImport(args.path);
      if (!resolved) {
        return null;
      }
      return { path: resolved };
    });
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

// clab-ui v0.0.9 has a schema import path that resolves to node_modules/schema.
// Redirect it to this repository's schema file during bundling.
const clabUiPathCompatPlugin = {
  name: "clab-ui-path-compat",
  setup(build) {
    build.onResolve({ filter: /schema\/clab\.schema\.json$/ }, (args) => {
      if (!args.importer.startsWith(clabUiRoot)) {
        return null;
      }
      return { path: path.join(__dirname, "schema/clab.schema.json") };
    });
  }
};

// Copy font files to dist
async function copyFonts() {
  const fontDir = path.join(__dirname, "dist/webfonts");
  await fs.promises.mkdir(fontDir, { recursive: true });

  // Copy wireshark SVG
  const wiresharkSrc = clabUiWiresharkSvg;
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
    plugins: [nativeNodeModulesPlugin, clabUiLocalAliasPlugin]
  });

  // Build webview (Browser) - CSS handled separately
  const webviewBuild = esbuild.build({
    ...commonOptions,
    entryPoints: [clabUiMainEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/reactTopoViewerWebview.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin, clabUiLocalAliasPlugin],
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
    entryPoints: [clabUiExplorerEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/containerlabExplorerView.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin, clabUiLocalAliasPlugin],
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
    entryPoints: [clabUiWelcomeEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/welcomePageWebview.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin, clabUiLocalAliasPlugin],
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
    entryPoints: [clabUiInspectEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/inspectWebview.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin, clabUiLocalAliasPlugin],
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
    entryPoints: [clabUiNodeImpairmentsEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/nodeImpairmentsWebview.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin, clabUiLocalAliasPlugin],
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
    entryPoints: [clabUiWiresharkVncEntry],
    platform: "browser",
    format: "iife",
    target: ["es2020", "chrome90", "firefox90", "safari14"],
    outfile: "dist/wiresharkVncWebview.js",
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
    plugins: [ignoreCssPlugin, clabUiPathCompatPlugin]
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
      entryPoints: [clabUiMainEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/reactTopoViewerWebview.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      entryPoints: [clabUiExplorerEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/containerlabExplorerView.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      entryPoints: [clabUiWelcomeEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/welcomePageWebview.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      entryPoints: [clabUiInspectEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/inspectWebview.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      entryPoints: [clabUiNodeImpairmentsEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/nodeImpairmentsWebview.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      entryPoints: [clabUiWiresharkVncEntry],
      platform: "browser",
      format: "iife",
      target: ["es2020", "chrome90", "firefox90", "safari14"],
      outfile: "dist/wiresharkVncWebview.js",
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin],
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
      plugins: [ignoreCssPlugin, clabUiPathCompatPlugin]
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
    const cssWatcher = watch(path.join(clabUiRoot, "src/styles/**/*.css"), {
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
