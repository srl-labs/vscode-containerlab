import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { fileApiPlugin } from "./server/fileApi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.resolve(__dirname, "../node_modules");

export default defineConfig({
  plugins: [
    react(),
    // File API middleware for YAML and annotation file operations
    fileApiPlugin()
  ],
  root: __dirname,
  publicDir: path.resolve(__dirname, "../resources"),
  resolve: {
    alias: {
      // CRITICAL: Force single React instance by explicit paths
      react: path.resolve(nodeModules, "react"),
      "react-dom": path.resolve(nodeModules, "react-dom"),
      // Browser/dev builds do not have VS Code extension host APIs available.
      vscode: path.resolve(__dirname, "./stubs/vscode.ts")
    },
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    // Keep this list limited to real, direct deps. A missing entry here can cause
    // CI-only startup issues (e.g. "Failed to resolve dependency ...").
    include: ["react", "react-dom"]
  },
  css: {
    postcss: path.resolve(__dirname, "../postcss.config.js")
  },
  server: {
    port: 5173,
    // Don't attempt to open a browser in CI.
    open: !process.env.CI,
    fs: {
      allow: [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname, "../node_modules"),
        path.resolve(__dirname, "../../containerlab-gui"),
        path.resolve(__dirname, "../../containerlab-gui/node_modules")
      ]
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-dev")
  }
});
