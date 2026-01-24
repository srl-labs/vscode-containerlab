/**
 * SSE (Server-Sent Events) Manager for Live File Updates
 *
 * Manages SSE client connections per session, enabling real-time
 * file change notifications to the browser.
 */

import type { ServerResponse } from "http";
import * as path from "path";
import { watch } from "chokidar";

// Type for SSE client connection
interface SSEClient {
  res: ServerResponse;
  sessionId: string;
}

// Active SSE clients grouped by sessionId
const clients: Map<string, Set<SSEClient>> = new Map();

// Special session ID for non-session clients (direct dev mode)
const NO_SESSION = "__no_session__";

/**
 * Add a new SSE client connection
 */
export function addClient(sessionId: string, res: ServerResponse): void {
  if (!clients.has(sessionId)) {
    clients.set(sessionId, new Set());
  }

  const client: SSEClient = { res, sessionId };
  clients.get(sessionId)!.add(client);

  console.log(
    `[SSE] Client connected (session: ${sessionId}, total: ${clients.get(sessionId)!.size})`
  );

  // Handle disconnect
  res.on("close", () => {
    removeClient(sessionId, client);
  });
}

/**
 * Remove a disconnected client
 */
function removeClient(sessionId: string, client: SSEClient): void {
  const sessionClients = clients.get(sessionId);
  if (sessionClients) {
    sessionClients.delete(client);
    console.log(
      `[SSE] Client disconnected (session: ${sessionId}, remaining: ${sessionClients.size})`
    );

    // Clean up empty session
    if (sessionClients.size === 0) {
      clients.delete(sessionId);
    }
  }
}

/**
 * Broadcast a file change event to all clients in a session
 */
export function broadcastFileChange(sessionId: string, filePath: string): void {
  const sessionClients = clients.get(sessionId);
  if (!sessionClients || sessionClients.size === 0) {
    return;
  }

  // Determine file type
  const type = filePath.endsWith(".annotations.json") ? "annotations" : "yaml";

  const event = {
    path: filePath,
    type,
    timestamp: Date.now()
  };

  const message = `event: file-changed\ndata: ${JSON.stringify(event)}\n\n`;

  console.log(
    `[SSE] Broadcasting file change (session: ${sessionId}, path: ${filePath}, clients: ${sessionClients.size})`
  );

  for (const client of sessionClients) {
    try {
      client.res.write(message);
    } catch (err) {
      console.error("[SSE] Failed to send message:", err);
    }
  }
}

/**
 * Broadcast a file change event to ALL connected clients (for disk file changes)
 */
export function broadcastFileChangeToAll(filePath: string): void {
  // Determine file type
  const type = filePath.endsWith(".annotations.json") ? "annotations" : "yaml";
  const filename = path.basename(filePath);

  const event = {
    path: filename,
    type,
    timestamp: Date.now()
  };

  const message = `event: file-changed\ndata: ${JSON.stringify(event)}\n\n`;

  let totalClients = 0;
  for (const [sessionId, sessionClients] of clients) {
    for (const client of sessionClients) {
      try {
        client.res.write(message);
        totalClients++;
      } catch (err) {
        console.error("[SSE] Failed to send message:", err);
      }
    }
  }

  if (totalClients > 0) {
    console.log(`[SSE] Broadcast disk file change to ${totalClients} clients: ${filename}`);
  }
}

/**
 * Send a heartbeat to keep connections alive
 */
export function sendHeartbeat(): void {
  const message = `: heartbeat\n\n`;

  for (const [sessionId, sessionClients] of clients) {
    for (const client of sessionClients) {
      try {
        client.res.write(message);
      } catch {
        // Client likely disconnected, will be cleaned up
      }
    }
  }
}

// Send heartbeat every 30 seconds to keep connections alive
setInterval(sendHeartbeat, 30000);

// ============================================================================
// File Watcher for Disk Changes
// ============================================================================

let fileWatcher: ReturnType<typeof watch> | null = null;

/**
 * Start watching the topologies directory for file changes
 */
export function startFileWatcher(topologiesDir: string): void {
  if (fileWatcher) {
    console.log("[SSE] File watcher already running");
    return;
  }

  console.log(`[SSE] Starting file watcher for: ${topologiesDir}`);

  fileWatcher = watch(topologiesDir, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    // Debounce rapid changes
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });

  fileWatcher.on("change", (filePath) => {
    // Only watch .clab.yml and .annotations.json files
    if (filePath.endsWith(".clab.yml") || filePath.endsWith(".annotations.json")) {
      console.log(`[SSE] Disk file changed: ${filePath}`);
      broadcastFileChangeToAll(filePath);
    }
  });

  fileWatcher.on("error", (error) => {
    console.error("[SSE] File watcher error:", error);
  });

  console.log("[SSE] File watcher started");
}

/**
 * Stop the file watcher
 */
export function stopFileWatcher(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log("[SSE] File watcher stopped");
  }
}
