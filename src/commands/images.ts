import * as vscode from "vscode";

import {
  collectKindImageReferencesFromCustomTemplates,
  collectKindImageReferencesFromYaml,
  type ImageActionResult,
  type ImageManagerTargetOptions,
  type ImagePullRequest,
  type ImageRemoveRequest,
  type KindImageReference
} from "@srl-labs/clab-ui/image-manager/catalog";

import { getImageManagerWebviewHtml } from "../webviews/imageManager/imageManagerWebviewHtml";
import { pullDockerImage } from "../utils/docker/docker";
import { listDockerImageSummaries, removeDockerImage } from "../utils/docker/images";
import {
  getCustomNodesFromConfig,
  loadSchemaData
} from "../reactTopoViewer/extension/services/schema";

type ImageManagerRequestMessage = {
  command?: string;
  requestId?: string;
  action?: string;
  payload?: unknown;
};

let currentPanel: vscode.WebviewPanel | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string {
  return optionalString(record, key) ?? "";
}

function isImageManagerRequest(message: unknown): message is Required<ImageManagerRequestMessage> {
  if (!isRecord(message)) {
    return false;
  }
  return (
    message.command === "image-manager:request" &&
    typeof message.requestId === "string" &&
    typeof message.action === "string"
  );
}

function asTargetOptions(payload: unknown): ImageManagerTargetOptions {
  const record = isRecord(payload) ? payload : {};
  const endpointId = optionalString(record, "endpointId");
  return endpointId === undefined ? {} : { endpointId };
}

function asPullRequest(payload: unknown): ImagePullRequest {
  const record = isRecord(payload) ? payload : {};
  const endpointId = optionalString(record, "endpointId");
  const kind = optionalString(record, "kind");
  const request: ImagePullRequest = {
    ...(endpointId === undefined ? {} : { endpointId }),
    image: stringField(record, "image")
  };
  if (kind !== undefined) {
    request.kind = kind;
  }
  return request;
}

function asRemoveRequest(payload: unknown): ImageRemoveRequest {
  const record = isRecord(payload) ? payload : {};
  const endpointId = optionalString(record, "endpointId");
  return {
    ...(endpointId === undefined ? {} : { endpointId }),
    reference: stringField(record, "reference"),
    force: record.force === true
  };
}

function referenceOptions(
  options: ImageManagerTargetOptions,
  extra: { label: string; path?: string }
): { endpointId?: string; label: string; path?: string } {
  return {
    ...extra,
    ...(options.endpointId === undefined ? {} : { endpointId: options.endpointId })
  };
}

async function collectWorkspaceImageReferences(
  options: ImageManagerTargetOptions
): Promise<KindImageReference[]> {
  const yamlFiles = await vscode.workspace.findFiles(
    "**/*.clab.{yml,yaml}",
    "**/{node_modules,.git,out,dist}/**",
    1000
  );
  const references: KindImageReference[] = [];
  for (const uri of yamlFiles) {
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      references.push(
        ...collectKindImageReferencesFromYaml(
          content,
          referenceOptions(options, {
            label: vscode.workspace.asRelativePath(uri, false),
            path: uri.fsPath
          })
        )
      );
    } catch {
      // Ignore malformed or unreadable topology candidates.
    }
  }

  references.push(
    ...collectKindImageReferencesFromCustomTemplates(
      getCustomNodesFromConfig(),
      referenceOptions(options, {
        label: "Custom"
      })
    )
  );
  return references;
}

async function handleImageManagerRequest(
  message: Required<ImageManagerRequestMessage>
): Promise<unknown> {
  switch (message.action) {
    case "listImages":
      return listDockerImageSummaries();
    case "listImageReferences":
      return collectWorkspaceImageReferences(asTargetOptions(message.payload));
    case "pullImage": {
      const request = asPullRequest(message.payload);
      const image = request.image.trim();
      if (image.length === 0) {
        throw new Error("Image reference is required.");
      }
      const success = await pullDockerImage(image);
      return {
        success,
        image,
        message: success ? `Pulled ${image}.` : `Failed to pull ${image}.`
      } satisfies ImageActionResult;
    }
    case "removeImage": {
      const request = asRemoveRequest(message.payload);
      const reference = request.reference.trim();
      if (reference.length === 0) {
        throw new Error("Image reference is required.");
      }
      await removeDockerImage(reference, request.force === true);
      return {
        success: true,
        image: reference,
        message: `Removed ${reference}.`
      } satisfies ImageActionResult;
    }
    default:
      throw new Error(`Unsupported image manager action: ${message.action}`);
  }
}

async function respondToImageManagerRequest(
  panel: vscode.WebviewPanel,
  message: unknown
): Promise<void> {
  if (!isImageManagerRequest(message)) {
    return;
  }
  try {
    const result = await handleImageManagerRequest(message);
    await panel.webview.postMessage({
      type: "image-manager:response",
      requestId: message.requestId,
      success: true,
      result
    });
  } catch (error) {
    await panel.webview.postMessage({
      type: "image-manager:response",
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function manageImages(context: vscode.ExtensionContext): Promise<void> {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "containerlabImageManager",
    "Containerlab Images",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "dist"),
        vscode.Uri.joinPath(context.extensionUri, "resources")
      ]
    }
  );
  currentPanel = panel;
  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  const schemaData = await loadSchemaData(context.extensionUri);
  panel.webview.html = getImageManagerWebviewHtml(panel.webview, context.extensionUri, {
    schemaData
  });
  panel.webview.onDidReceiveMessage((message: unknown) => {
    void respondToImageManagerRequest(panel, message);
  });
}
