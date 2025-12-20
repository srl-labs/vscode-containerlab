import * as vscode from "vscode";

import { dockerClient, outputChannel } from "../../globals";

let dockerImagesCache: string[] = [];

const dockerImagesEmitter = new vscode.EventEmitter<string[]>();

export const onDockerImagesUpdated = dockerImagesEmitter.event;

export function getDockerImages(): string[] {
  return [...dockerImagesCache];
}

// Internal func to fetch all docker images
async function fetchDockerImages(): Promise<string[]> {
  if (!dockerClient) {
    outputChannel.debug("getDockerImages() failed: docker client unavailable.")
    return [];
  }

  const images = await dockerClient.listImages();
  type TagEntry = { tag: string; created: number };
  const entries: TagEntry[] = [];
  const seen = new Set<string>();

  for (const img of images) {
    const repoTags = Array.isArray(img.RepoTags) ? img.RepoTags : [];
    for (const tag of repoTags) {
      const isValid = tag && !tag.endsWith(":<none>") && !tag.startsWith("<none>");
      if (isValid && !seen.has(tag)) {
        seen.add(tag);
        entries.push({ tag, created: typeof img.Created === "number" ? img.Created : 0 });
      }
    }
  }

  entries.sort((a, b) => b.created - a.created || a.tag.localeCompare(b.tag));
  return entries.map(entry => entry.tag);
}

function updateDockerImagesCache(images: string[]) {
  const changed =
    images.length !== dockerImagesCache.length ||
    images.some((img, idx) => dockerImagesCache[idx] !== img);
  if (!changed) {
    return;
  }
  dockerImagesCache = images;
  // fire an event to whom is listenting that the cache updated.
  dockerImagesEmitter.fire([...dockerImagesCache]);
}

export async function refreshDockerImages() {
  outputChannel.debug("Refreshing docker image cache.")
  try {
    const images = await fetchDockerImages();
    updateDockerImagesCache(images);
    outputChannel.debug("SUCCESS! Refreshed docker image cache.")
  } catch {
    // Leave existing cache untouched.
  }
}

// Create disposable handle to let the image monitor get cleaned up by VSC.
let monitorHandle: vscode.Disposable | undefined;

export function startDockerImageEventMonitor(context: vscode.ExtensionContext) {
  if (monitorHandle || !dockerClient) {
    return;
  }

  // Start a 'docker events' but only for image events.
  dockerClient.getEvents({ filters:{ type: ["image"] }}).then(stream => {
      const onData = () => {
        // upon any event, the cache should be updated.
        refreshDockerImages();
      };

      const onError = (err: Error) => {
        outputChannel.error(`Docker images event stream error: ${err.message}`);
      };

      stream.on("data", onData);
      stream.on("error", onError);

      // Ensure we check if the monitor handle needs to dispose us.
      monitorHandle = {
        dispose: () => {
          stream.off("data", onData);
          stream.off("error", onError);
          stream.removeAllListeners();
          monitorHandle = undefined;
        }
      };
      context.subscriptions.push(monitorHandle);

    })
    .catch((err: any) => {
      outputChannel.warn(`Unable to subscribe to Docker image events: ${err?.message || err}`);
    });
}
