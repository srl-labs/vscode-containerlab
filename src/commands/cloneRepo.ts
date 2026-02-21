import * as vscode from "vscode";

import { cloneRepoFromUrl } from "./cloneRepoCore";

export async function cloneRepo() {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Clone via Git URL", action: "url" },
      { label: "Clone popular lab", action: "popular" },
    ],
    { title: "Clone repository" }
  );

  if (!choice) {
    return;
  }

  if (choice.action === "url") {
    await cloneRepoFromUrl();
  } else if (choice.action === "popular") {
    const mod = await import("./clonePopularRepo");
    await mod.clonePopularRepo();
  }
}
