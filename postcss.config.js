const path = require("path");

module.exports = {
  plugins: {
    "postcss-import": {
      resolve(id, basedir) {
        // clab-ui v0.0.9 uses explicit "../../../../node_modules/..." imports
        // from inside node_modules/@srl-labs/clab-ui/src/styles/global.css.
        // Resolve those to this workspace's top-level node_modules directory.
        if (id.startsWith(".") && id.includes("node_modules/")) {
          const marker = "node_modules/";
          const markerIndex = id.indexOf(marker);
          if (markerIndex !== -1) {
            return path.resolve(__dirname, id.slice(markerIndex));
          }
        }

        return path.resolve(basedir, id);
      }
    },
    autoprefixer: {}
  }
};
