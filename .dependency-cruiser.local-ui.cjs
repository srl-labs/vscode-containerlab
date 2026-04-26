const base = require("./.dependency-cruiser.cjs");

module.exports = {
  ...base,
  options: {
    ...base.options,
    tsConfig: {
      fileName: "tsconfig.local-ui.json"
    }
  }
};
