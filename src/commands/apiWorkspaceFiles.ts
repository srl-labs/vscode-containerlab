import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";

import { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";
import { getBackendById, getBackendForLocalSource } from "../backends/manager";
import { extensionContext } from "../globals";
import type { ApiWorkspaceFileTreeNode } from "../treeView/apiWorkspaceFileProvider";

interface SynchronizedWorkspaceFile {
  backendId: string;
  remotePath: string;
}

const synchronizedFiles = new Map<string, SynchronizedWorkspaceFile>();

function apiBackend(node: ApiWorkspaceFileTreeNode): ApiContainerlabBackend | undefined {
  const backend = getBackendById(node.backendId);
  return backend instanceof ApiContainerlabBackend ? backend : undefined;
}

function parentPath(node: ApiWorkspaceFileTreeNode): string {
  if (node.resourceKind === "directory") return node.resourcePath;
  const parent = path.posix.dirname(node.resourcePath);
  return parent === "." ? "" : parent;
}

function joinRemote(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join("/");
}

function localWorkspacePath(backend: ApiContainerlabBackend, remotePath: string): string {
  const identity = createHash("sha256").update(backend.id).digest("hex").slice(0, 16);
  const root = path.join(extensionContext.globalStorageUri.fsPath, "api-workspace", identity);
  const normalizedRemotePath = remotePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const localPath = path.resolve(root, normalizedRemotePath);
  if (localPath !== root && !localPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("The API workspace path escapes its local working directory.");
  }
  return localPath;
}

export function registerApiWorkspaceFileSync(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const mapping = synchronizedFiles.get(document.uri.fsPath);
      if (mapping !== undefined) {
        const backend = getBackendById(mapping.backendId);
        if (!(backend instanceof ApiContainerlabBackend)) return;
        try {
          await backend.operations.writeWorkspaceFile(mapping.remotePath, document.getText());
        } catch (error) {
          vscode.window.showErrorMessage(
            `Could not save API workspace file: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        return;
      }

      const annotationsSuffix = ".annotations.json";
      const yamlPath = document.uri.fsPath.endsWith(annotationsSuffix)
        ? document.uri.fsPath.slice(0, -annotationsSuffix.length)
        : document.uri.fsPath;
      const backend = getBackendForLocalSource(yamlPath);
      if (backend instanceof ApiContainerlabBackend) {
        try {
          await backend.synchronizeMaterializedDocument(document.uri.fsPath, document.getText());
        } catch (error) {
          vscode.window.showErrorMessage(
            `Could not save API topology file: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    })
  );
}

export async function openApiWorkspaceFile(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node || node.resourceKind !== "file") return;
  const backend = apiBackend(node);
  if (!backend) throw new Error("The API endpoint is not connected.");
  const content = await backend.operations.readWorkspaceFile(node.resourcePath);
  const localPath = localWorkspacePath(backend, node.resourcePath);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, content, "utf8");
  synchronizedFiles.set(localPath, { backendId: backend.id, remotePath: node.resourcePath });
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(localPath));
  await vscode.window.showTextDocument(document, { preview: false });
}

export async function newApiWorkspaceFile(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node) return;
  const backend = apiBackend(node);
  if (!backend) throw new Error("The API endpoint is not connected.");
  const value = await vscode.window.showInputBox({
    title: "New API workspace file",
    value: joinRemote(parentPath(node), "new-file.txt"),
    validateInput: (input) => (input.trim() ? undefined : "A file path is required.")
  });
  if (!value?.trim()) return;
  await backend.operations.writeWorkspaceFile(value.trim(), "");
}

export async function newApiWorkspaceFolder(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node) return;
  const backend = apiBackend(node);
  if (!backend) throw new Error("The API endpoint is not connected.");
  const value = await vscode.window.showInputBox({
    title: "New API workspace folder",
    value: joinRemote(parentPath(node), "new-folder"),
    validateInput: (input) => (input.trim() ? undefined : "A folder path is required.")
  });
  if (!value?.trim()) return;
  await backend.operations.createWorkspaceDirectory(value.trim());
}

export async function renameApiWorkspacePath(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node || !node.resourcePath) return;
  const backend = apiBackend(node);
  if (!backend) throw new Error("The API endpoint is not connected.");
  const value = await vscode.window.showInputBox({
    title: "Rename API workspace path",
    value: node.resourcePath,
    validateInput: (input) => (input.trim() ? undefined : "A destination path is required.")
  });
  if (!value?.trim() || value.trim() === node.resourcePath) return;
  await backend.operations.renameWorkspacePath(node.resourcePath, value.trim());
}

export async function deleteApiWorkspacePath(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node || !node.resourcePath) return;
  const backend = apiBackend(node);
  if (!backend) throw new Error("The API endpoint is not connected.");
  const confirmation = await vscode.window.showWarningMessage(
    `Delete remote ${node.resourceKind} "${node.resourcePath}"?`,
    { modal: true },
    "Delete"
  );
  if (confirmation !== "Delete") return;
  await backend.operations.deleteWorkspacePath(
    node.resourcePath,
    node.resourceKind === "directory"
  );
}

export async function copyApiWorkspacePath(node?: ApiWorkspaceFileTreeNode): Promise<void> {
  if (!node) return;
  await vscode.env.clipboard.writeText(node.resourcePath);
}
