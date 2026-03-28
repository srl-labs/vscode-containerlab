#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_VERSION = "0.0.1";

function parseArgs(argv) {
  const parsed = {
    source: "local",
    version: DEFAULT_VERSION
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" && argv[i + 1]) {
      parsed.source = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--source=")) {
      parsed.source = arg.split("=", 2)[1];
      continue;
    }
    if (arg === "--version" && argv[i + 1]) {
      parsed.version = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--version=")) {
      parsed.version = arg.split("=", 2)[1];
      continue;
    }
  }

  return parsed;
}

function resolveSpec({ source, version }) {
  if (source === "local") {
    return "file:../containerlab-gui/packages/ui";
  }

  if (source === "github") {
    return version;
  }

  throw new Error(`Unsupported source '${source}'. Use 'local' or 'github'.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = resolveSpec(args);

  const packageJsonPath = path.join(process.cwd(), "package.json");
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const data = JSON.parse(raw);

  const devDeps = data.devDependencies ?? {};
  devDeps["@srl-labs/clab-ui"] = spec;
  delete devDeps["@srl-labs/clab-adapter-vscode"];
  data.devDependencies = devDeps;

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  process.stdout.write(`Dependency source set to '${args.source}':\n`);
  process.stdout.write(`- @srl-labs/clab-ui => ${spec}\n`);
}

main();
