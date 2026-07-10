import * as vscode from "vscode";

import { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";
import { getBackendForResource } from "../backends/manager";
import { pickPopularRepo } from "../helpers/popularLabs";

import { cloneRepoFromUrl } from "./cloneRepoCore";

export async function cloneRepo(target?: unknown) {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Clone via Git URL", action: "url" },
      { label: "Clone popular lab", action: "popular" }
    ],
    { title: "Clone repository" }
  );

  if (!choice) {
    return;
  }

  const backend = getBackendForResource(target);
  if (backend instanceof ApiContainerlabBackend) {
    const sourceUrl =
      choice.action === "popular"
        ? (await pickPopularRepo("Import popular lab", "Select a repository to import"))?.repo
        : await vscode.window.showInputBox({
            title: "Git repository URL",
            placeHolder: "https://github.com/user/repo.git",
            prompt: `Import an undeployed topology into ${backend.getConnectionInfo().url}`
          });
    if (!sourceUrl?.trim()) return;
    try {
      const result = await backend.operations.importTopologyFromUrl(sourceUrl.trim());
      vscode.window.showInformationMessage(
        `Imported ${result.fileName || result.labName} into ${backend.getConnectionInfo().url}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`API topology import failed: ${message}`);
    }
    return;
  }

  if (choice.action === "url") {
    await cloneRepoFromUrl();
  } else if (choice.action === "popular") {
    const mod = await import("./clonePopularRepo");
    await mod.clonePopularRepo();
  }
}
