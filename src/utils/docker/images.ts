import * as vscode from "vscode";

import { dockerClient, outputChannel } from "../../globals";

let dockerImagesCache: string[] = [];

const dockerImagesEmitter = new vscode.EventEmitter<string[]>();

export const onDockerImagesUpdated = dockerImagesEmitter.event;

export function getDockerImages(): string[] {
  return [...dockerImagesCache];
}

export interface DockerImageSummary {
  id: string;
  shortId?: string;
  repoTags: string[];
  repoDigests: string[];
  created?: number;
  size?: number;
  virtualSize?: number;
}

function validDockerReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.endsWith(":<none>") &&
    !value.startsWith("<none>") &&
    !value.includes("<none>@")
  );
}

export async function listDockerImageSummaries(): Promise<DockerImageSummary[]> {
  const images = await dockerClient.listImages({ all: true });
  return images
    .map((img) => {
      const id = typeof img.Id === "string" ? img.Id : "";
      const shortId = id.replace(/^sha256:/, "").slice(0, 12);
      return {
        id,
        shortId,
        repoTags: (Array.isArray(img.RepoTags) ? img.RepoTags : []).filter(validDockerReference),
        repoDigests: (Array.isArray(img.RepoDigests) ? img.RepoDigests : []).filter(
          validDockerReference
        ),
        created: typeof img.Created === "number" ? img.Created : undefined,
        size: typeof img.Size === "number" ? img.Size : undefined,
        virtualSize: typeof img.VirtualSize === "number" ? img.VirtualSize : undefined
      };
    })
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

// Internal func to fetch all docker images
async function fetchDockerImages(): Promise<string[]> {
  const images = await listDockerImageSummaries();
  type TagEntry = { tag: string; created: number };
  const entries: TagEntry[] = [];
  const seen = new Set<string>();

  for (const img of images) {
    for (const tag of img.repoTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        entries.push({ tag, created: img.created ?? 0 });
      }
    }
  }

  entries.sort((a, b) => b.created - a.created || a.tag.localeCompare(b.tag));
  return entries.map((entry) => entry.tag);
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
  outputChannel.debug("Refreshing docker image cache.");
  try {
    const images = await fetchDockerImages();
    updateDockerImagesCache(images);
    outputChannel.debug("SUCCESS! Refreshed docker image cache.");
  } catch {
    // Leave existing cache untouched.
  }
}

export async function removeDockerImage(reference: string, force = false): Promise<void> {
  await dockerClient.getImage(reference).remove({ force });
  await refreshDockerImages();
}

// Create disposable handle to let the image monitor get cleaned up by VSC.
let monitorHandle: vscode.Disposable | undefined;

export function startDockerImageEventMonitor(context: vscode.ExtensionContext) {
  if (monitorHandle !== undefined) {
    return;
  }

  // Start a 'docker events' but only for image events.
  dockerClient
    .getEvents({ filters: { type: ["image"] } })
    .then((stream) => {
      const onData = () => {
        // upon any event, the cache should be updated.
        void refreshDockerImages();
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
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.warn(`Unable to subscribe to Docker image events: ${message}`);
    });
}
