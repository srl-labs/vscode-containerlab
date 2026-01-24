import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { fileApiPlugin } from "./server/fileApi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.resolve(__dirname, "../node_modules");

export default defineConfig({
  plugins: [
    react({
      // Disable Fast Refresh to avoid hook-related HMR issues
      fastRefresh: false
    }),
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
      // Allow importing from the actual webview source
      "@webview": path.resolve(__dirname, "../src/reactTopoViewer/webview"),
      "@shared": path.resolve(__dirname, "../src/reactTopoViewer/shared")
    },
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    include: ["react", "react-dom", "cytoscape"]
  },
  css: {
    postcss: path.resolve(__dirname, "../postcss.config.js")
  },
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-dev")
  }
});
