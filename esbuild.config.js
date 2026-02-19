const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const GUI_PACKAGE_NAME = "@srl-labs/containerlab-gui";

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

function resolveGuiDistDir() {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve(`${GUI_PACKAGE_NAME}/package.json`, {
      paths: [__dirname]
    });
  } catch {
    throw new Error(
      `${GUI_PACKAGE_NAME} is not installed. Run \`npm install\` in vscode-containerlab first.`
    );
  }

  const guiDistDir = path.join(path.dirname(packageJsonPath), "dist");
  if (!fs.existsSync(guiDistDir)) {
    throw new Error(
      `${GUI_PACKAGE_NAME} dist assets are missing at ${guiDistDir}. Build the package first.`
    );
  }
  return guiDistDir;
}

async function copyFile(sourcePath, destinationPath) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.promises.copyFile(sourcePath, destinationPath);
}

async function copyDirectoryRecursive(sourceDir, destinationDir) {
  await fs.promises.mkdir(destinationDir, { recursive: true });
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destinationPath);
      continue;
    }

    await copyFile(sourcePath, destinationPath);
  }
}

async function syncGuiAssetsFromPackage() {
  const guiDistDir = resolveGuiDistDir();
  const manifestPath = path.join(guiDistDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing GUI manifest at ${manifestPath}`);
  }

  const manifestRaw = await fs.promises.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const manifestValues = Object.values(manifest).filter((value) => typeof value === "string");

  const filesToCopy = new Set([...manifestValues, "manifest.json"]);
  for (const relativeFilePath of filesToCopy) {
    const sourcePath = path.join(guiDistDir, relativeFilePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Expected GUI asset missing: ${sourcePath}`);
    }
    const destinationPath = path.join(__dirname, "dist", relativeFilePath);
    await copyFile(sourcePath, destinationPath);
  }

  const webfontsSourceDir = path.join(guiDistDir, "webfonts");
  if (fs.existsSync(webfontsSourceDir)) {
    await copyDirectoryRecursive(webfontsSourceDir, path.join(__dirname, "dist", "webfonts"));
  }
}

async function createExtensionBuildContext(commonOptions) {
  return esbuild.context({
    ...commonOptions,
    entryPoints: ["src/extension.ts"],
    platform: "node",
    format: "cjs",
    external: ["vscode"],
    outfile: "dist/extension.js",
    plugins: [nativeNodeModulesPlugin]
  });
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

  const extensionBuildContext = await createExtensionBuildContext(commonOptions);

  if (isWatch) {
    await extensionBuildContext.watch();
    await syncGuiAssetsFromPackage();

    const { watch } = require("chokidar");
    const guiDistDir = resolveGuiDistDir();
    const guiAssetsWatcher = watch(path.join(guiDistDir, "**/*"), {
      ignoreInitial: true
    });

    let syncInProgress = false;
    let syncQueued = false;

    const syncAssets = async () => {
      if (syncInProgress) {
        syncQueued = true;
        return;
      }

      syncInProgress = true;
      try {
        await syncGuiAssetsFromPackage();
        console.log("Synced GUI assets from npm package");
      } catch (error) {
        console.error("Failed syncing GUI assets:", error);
      } finally {
        syncInProgress = false;
        if (syncQueued) {
          syncQueued = false;
          void syncAssets();
        }
      }
    };

    guiAssetsWatcher.on("add", () => void syncAssets());
    guiAssetsWatcher.on("change", () => void syncAssets());
    guiAssetsWatcher.on("unlink", () => void syncAssets());

    process.on("SIGINT", async () => {
      await guiAssetsWatcher.close();
      await extensionBuildContext.dispose();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await guiAssetsWatcher.close();
      await extensionBuildContext.dispose();
      process.exit(0);
    });

    console.log("Watching for changes...");
    return;
  }

  await Promise.all([extensionBuildContext.rebuild(), syncGuiAssetsFromPackage()]);
  await extensionBuildContext.dispose();

  console.log("Build complete!");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
