// Vite API middleware — REST endpoints for file I/O and TopologyHost commands.

import type { Plugin } from "vite";
import * as fs from "fs";
import * as path from "path";
import { TopologyHostCore } from "../../src/reactTopoViewer/shared/host/TopologyHostCore";
import { nodeFsAdapter } from "../../src/reactTopoViewer/shared/io";
import type { TopologyHostCommand } from "../../src/reactTopoViewer/shared/types/messages";
import type { DeploymentState } from "../../src/reactTopoViewer/shared/types/topology";
import { SessionFsAdapter, SessionMaps, createSessionMaps, resetSession } from "./SessionFsAdapter";
import { addClient, broadcastFileChange, startFileWatcher } from "./sseManager";
import { beginInternalUpdate, endInternalUpdate } from "./internalUpdateTracker";

const TOPOLOGIES_DIR = path.join(__dirname, "../topologies");
const TOPOLOGIES_ORIGINAL_DIR = path.join(__dirname, "../topologies-original");

// Host cache (per session + file)
const topologyHosts = new Map<string, TopologyHostCore>();

// ============================================================================
// Session Management
// ============================================================================

// Shared session maps for all sessions
const sessionMaps: SessionMaps = createSessionMaps();

/**
 * Get file system adapter for a session
 */
function getFsAdapter(sessionId?: string): SessionFsAdapter | null {
  if (sessionId) {
    return new SessionFsAdapter(sessionId, sessionMaps, TOPOLOGIES_DIR);
  }
  return null; // Use disk directly
}

function normalizeTopologyPath(requestedPath: string): string {
  const filename = path.basename(requestedPath);
  return path.join(TOPOLOGIES_DIR, filename);
}

function getTopologyHost(
  sessionId: string | undefined,
  filePath: string,
  context?: { mode?: "edit" | "view"; deploymentState?: DeploymentState }
): TopologyHostCore {
  const normalizedPath = normalizeTopologyPath(filePath);
  const key = `${sessionId ?? "__disk__"}:${normalizedPath}`;
  const fsAdapter = sessionId
    ? new SessionFsAdapter(sessionId, sessionMaps, TOPOLOGIES_DIR)
    : nodeFsAdapter;

  let host = topologyHosts.get(key);
  if (!host) {
    host = new TopologyHostCore({
      fs: fsAdapter,
      yamlFilePath: normalizedPath,
      mode: context?.mode ?? "edit",
      deploymentState: context?.deploymentState ?? "undeployed",
      setInternalUpdate: (updating: boolean) => {
        if (updating) {
          beginInternalUpdate(normalizedPath);
        } else {
          endInternalUpdate(normalizedPath);
        }
      },
      logger: console
    });
    topologyHosts.set(key, host);
  } else if (context) {
    host.updateContext({
      mode: context.mode,
      deploymentState: context.deploymentState
    });
  }

  return host;
}

function dropTopologyHosts(sessionId?: string): void {
  const prefix = sessionId ? `${sessionId}:` : "__disk__:";
  for (const key of topologyHosts.keys()) {
    if (key.startsWith(prefix)) {
      topologyHosts.delete(key);
    }
  }
}

// ============================================================================
// Reset Functionality
// ============================================================================

/**
 * Reset all disk files to their original state (from topologies-original folder)
 */
async function resetDiskFiles(): Promise<void> {
  console.log("[FileAPI] Resetting disk files from topologies-original...");

  try {
    // First, delete all annotation files in topologies (clean slate)
    const currentFiles = await fs.promises.readdir(TOPOLOGIES_DIR);
    for (const file of currentFiles) {
      if (file.endsWith(".annotations.json")) {
        const filePath = path.join(TOPOLOGIES_DIR, file);
        try {
          await fs.promises.unlink(filePath);
          console.log("[FileAPI] Deleted:", file);
        } catch {
          // Ignore errors
        }
      }
    }

    // Copy all files from topologies-original to topologies
    const originalFiles = await fs.promises.readdir(TOPOLOGIES_ORIGINAL_DIR);
    for (const file of originalFiles) {
      const srcPath = path.join(TOPOLOGIES_ORIGINAL_DIR, file);
      const destPath = path.join(TOPOLOGIES_DIR, file);

      const content = await fs.promises.readFile(srcPath, "utf8");
      await fs.promises.writeFile(destPath, content, "utf8");
      console.log("[FileAPI] Restored:", file);
    }

    console.log("[FileAPI] Disk reset complete");
  } catch (err) {
    console.error("[FileAPI] Failed to reset disk files:", err);
    throw err;
  }
}

// ============================================================================
// File Operations
// ============================================================================

interface TopologyFile {
  filename: string;
  path: string;
  hasAnnotations: boolean;
}

/**
 * List all .clab.yml files
 */
async function listTopologyFiles(sessionId?: string): Promise<TopologyFile[]> {
  try {
    // Always read disk files as base
    const files = await fs.promises.readdir(TOPOLOGIES_DIR);
    const diskYamlFiles = files.filter((f) => f.endsWith(".clab.yml"));

    // If session exists, merge with session storage (session takes priority)
    if (sessionId && sessionMaps.yamlFiles.has(sessionId)) {
      const yamlMap = sessionMaps.yamlFiles.get(sessionId)!;
      const annotMap = sessionMaps.annotationFiles.get(sessionId)!;

      // Start with disk files
      const allFiles = new Set(diskYamlFiles);
      // Add any session-only files
      for (const filename of yamlMap.keys()) {
        if (filename.endsWith(".clab.yml")) {
          allFiles.add(filename);
        }
      }

      return Array.from(allFiles).map((filename) => ({
        filename,
        path: path.join(TOPOLOGIES_DIR, filename),
        hasAnnotations: annotMap.has(filename)
          ? annotMap.get(filename) !== null
          : files.includes(`${filename}.annotations.json`)
      }));
    }

    // No session - just return disk files
    return diskYamlFiles.map((filename) => ({
      filename,
      path: path.join(TOPOLOGIES_DIR, filename),
      hasAnnotations: files.includes(`${filename}.annotations.json`)
    }));
  } catch (err) {
    console.error("[FileAPI] Failed to list topologies:", err);
    return [];
  }
}

/**
 * Read a file (from session or disk)
 */
async function readFile(filePath: string, sessionId?: string): Promise<string | null> {
  const fsAdapter = getFsAdapter(sessionId);

  if (fsAdapter) {
    try {
      return await fsAdapter.readFile(filePath);
    } catch {
      return null;
    }
  }

  // No session - read from disk
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Write a file (to session or disk)
 */
async function writeFile(filePath: string, content: string, sessionId?: string): Promise<void> {
  const fsAdapter = getFsAdapter(sessionId);

  if (fsAdapter) {
    await fsAdapter.writeFile(filePath, content);
    return;
  }

  // No session - write to disk
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf8");
}

/**
 * Delete a file (from session or disk)
 */
async function deleteFile(filePath: string, sessionId?: string): Promise<void> {
  const fsAdapter = getFsAdapter(sessionId);

  if (fsAdapter) {
    await fsAdapter.unlink(filePath);
    return;
  }

  // No session - delete from disk
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check if a file exists (in session or disk)
 */
async function fileExists(filePath: string, sessionId?: string): Promise<boolean> {
  const fsAdapter = getFsAdapter(sessionId);

  if (fsAdapter) {
    return fsAdapter.exists(filePath);
  }

  // No session - check disk
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Vite Plugin
// ============================================================================

/**
 * Extract session ID from request (header or query param)
 */
function getSessionId(req: import("http").IncomingMessage, url: string): string | undefined {
  // Check X-Session-ID header first
  const headerSession = req.headers["x-session-id"];
  if (headerSession && typeof headerSession === "string") {
    return headerSession;
  }

  // Check query parameter
  const urlObj = new URL(url, "http://localhost");
  return urlObj.searchParams.get("sessionId") || undefined;
}

/**
 * Decode file path from URL parameter
 */
function decodeFilePath(encodedPath: string): string {
  return decodeURIComponent(encodedPath);
}

/**
 * Read request body as text
 */
function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Vite plugin that adds API middleware for file operations
 */
export function fileApiPlugin(): Plugin {
  return {
    name: "file-api",
    configureServer(server) {
      // Ensure the working topologies directory exists by copying from originals
      if (!fs.existsSync(TOPOLOGIES_DIR)) {
        fs.mkdirSync(TOPOLOGIES_DIR, { recursive: true });
        if (fs.existsSync(TOPOLOGIES_ORIGINAL_DIR)) {
          for (const file of fs.readdirSync(TOPOLOGIES_ORIGINAL_DIR)) {
            fs.copyFileSync(
              path.join(TOPOLOGIES_ORIGINAL_DIR, file),
              path.join(TOPOLOGIES_DIR, file)
            );
          }
          console.log("[FileAPI] Created topologies/ from topologies-original/");
        }
      }

      // Start file watcher for disk changes (for dev mode without session)
      startFileWatcher(TOPOLOGIES_DIR);

      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || "";

        // Parse URL without query string for route matching
        const urlWithoutQuery = fullUrl.split("?")[0];
        const sessionId = getSessionId(req, fullUrl);

        try {
          // ----------------------------------------------------------------
          // GET /files - List available topology files
          // ----------------------------------------------------------------
          if (urlWithoutQuery === "/files" && req.method === "GET") {
            const files = await listTopologyFiles(sessionId);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(files));
            return;
          }

          // ----------------------------------------------------------------
          // GET /api/events - SSE endpoint for live file change notifications
          // ----------------------------------------------------------------
          if (urlWithoutQuery === "/api/events" && req.method === "GET") {
            // Use sessionId if provided, otherwise use a special "no-session" identifier
            // This allows dev mode (no session) to receive disk file change notifications
            const effectiveSessionId = sessionId || "__dev_mode__";

            // Set SSE headers
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("Access-Control-Allow-Origin", "*");

            // Send initial connection message
            res.write(`event: connected\ndata: {"sessionId":"${effectiveSessionId}"}\n\n`);

            // Register client with SSE manager
            addClient(effectiveSessionId, res);

            // Keep connection open (don't call res.end())
            return;
          }

          // ----------------------------------------------------------------
          // POST /api/reset - Reset files to original state
          // ----------------------------------------------------------------
          if (urlWithoutQuery === "/api/reset" && req.method === "POST") {
            if (sessionId) {
              // Reset session to use current disk files
              await resetSession(sessionId, sessionMaps, TOPOLOGIES_DIR);
              dropTopologyHosts(sessionId);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, sessionId }));
            } else {
              // Reset disk files to original state
              await resetDiskFiles();
              dropTopologyHosts();
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            }
            return;
          }

          // ----------------------------------------------------------------
          // POST /api/topology/snapshot - Get host snapshot
          // ----------------------------------------------------------------
          if (urlWithoutQuery === "/api/topology/snapshot" && req.method === "POST") {
            const body = await readBody(req);
            const payload = JSON.parse(body || "{}") as {
              path?: string;
              mode?: "edit" | "view";
              deploymentState?: DeploymentState;
              externalChange?: boolean;
            };

            if (!payload.path) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing topology path" }));
              return;
            }

            const host = getTopologyHost(sessionId, payload.path, {
              mode: payload.mode,
              deploymentState: payload.deploymentState
            });
            const snapshot = payload.externalChange
              ? await host.onExternalChange()
              : await host.getSnapshot();

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ snapshot }));
            return;
          }

          // ----------------------------------------------------------------
          // POST /api/topology/command - Apply command to host
          // ----------------------------------------------------------------
          if (urlWithoutQuery === "/api/topology/command" && req.method === "POST") {
            const body = await readBody(req);
            const payload = JSON.parse(body || "{}") as {
              path?: string;
              baseRevision?: number;
              command?: TopologyHostCommand;
              mode?: "edit" | "view";
              deploymentState?: DeploymentState;
            };

            if (!payload.path || !payload.command || typeof payload.baseRevision !== "number") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Invalid topology command request" }));
              return;
            }

            const host = getTopologyHost(sessionId, payload.path, {
              mode: payload.mode,
              deploymentState: payload.deploymentState
            });
            const response = await host.applyCommand(payload.command, payload.baseRevision);

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(response));
            return;
          }

          // ----------------------------------------------------------------
          // /file/:path - File CRUD operations
          // ----------------------------------------------------------------
          const fileMatch = urlWithoutQuery.match(/^\/file\/(.+)$/);
          if (fileMatch) {
            const filePath = decodeFilePath(fileMatch[1]);

            // HEAD /file/:path - Check if file exists
            if (req.method === "HEAD") {
              const exists = await fileExists(filePath, sessionId);
              res.statusCode = exists ? 200 : 404;
              res.end();
              return;
            }

            // GET /file/:path - Read file
            if (req.method === "GET") {
              const content = await readFile(filePath, sessionId);
              if (content === null) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/plain");
                res.end("Not found");
              } else {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end(content);
              }
              return;
            }

            // PUT /file/:path - Write file
            if (req.method === "PUT") {
              const content = await readBody(req);
              await writeFile(filePath, content, sessionId);

              // Broadcast file change to SSE clients
              if (sessionId) {
                // Extract just the filename from the path for broadcasting
                const filename = path.basename(filePath);
                broadcastFileChange(sessionId, filename);
              }

              res.statusCode = 200;
              res.end();
              return;
            }

            // DELETE /file/:path - Delete file
            if (req.method === "DELETE") {
              await deleteFile(filePath, sessionId);
              res.statusCode = 200;
              res.end();
              return;
            }
          }

          // Not an API route - pass to next handler
          return next();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[FileAPI] Error:", message);
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          res.end(message);
        }
      });
    }
  };
}
