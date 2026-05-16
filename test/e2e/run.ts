import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runTests } from "@vscode/test-electron";

function writeSmokeTopology(workspacePath: string): string {
  const topologyPath = path.join(workspacePath, "smoke.clab.yml");
  fs.writeFileSync(
    topologyPath,
    [
      "name: smoke",
      "",
      "topology:",
      "  nodes:",
      "    leaf1:",
      "      kind: linux",
      "      image: ghcr.io/srl-labs/network-multitool:latest",
      ""
    ].join("\n"),
    "utf8"
  );
  return topologyPath;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite");
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-containerlab-e2e-"));
  const topologyPath = writeSmokeTopology(workspacePath);

  process.env.VSCODE_CONTAINERLAB_E2E = "1";
  process.env.VSCODE_CONTAINERLAB_E2E_WORKSPACE = workspacePath;
  process.env.VSCODE_CONTAINERLAB_E2E_TOPOLOGY = topologyPath;

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      workspacePath,
      "--disable-extensions",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes"
    ]
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
