/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ─── Orphan detection ───
    {
      name: "no-orphans",
      comment: "Files not reachable from any entry point are likely dead code",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.(test|spec)\\.tsx?$", // test files
          "__mocks__", // mock files
          "\\.d\\.ts$", // type declaration files
          "index\\.ts$" // barrel files (may be entry points)
        ]
      },
      to: {}
    },

    // ─── Path depth limits ───
    {
      name: "no-deep-relative-imports",
      comment: "Prevent imports with more than 3 parent directory traversals (e.g., ../../../../)",
      severity: "error",
      from: {},
      to: {
        // Match paths that have 4+ parent directory traversals
        path: "^(\\.\\.[\\/]){4,}"
      }
    },

    // ─── Circular dependencies (complementing madge) ───
    {
      name: "no-circular",
      comment: "Circular dependencies are problematic for maintainability",
      severity: "error",
      from: {},
      to: {
        circular: true
      }
    }
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"]
    },
    exclude: {
      path: [
        "out/",
        "dist/",
        "dist-dev/",
        "legacy-backup/",
        "labs/",
        "dev/",
        "\\.test\\.tsx?$",
        "\\.spec\\.tsx?$"
      ]
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json"
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"]
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)",
        theme: {
          graph: {
            splines: "ortho"
          }
        }
      },
      text: {
        highlightFocused: true
      }
    }
  }
};
