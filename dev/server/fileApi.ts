/**
 * Vite API Middleware for File Operations
 *
 * Provides REST endpoints to read/write YAML and annotation files,
 * using the shared I/O layer for consistent behavior with the VS Code extension.
 */

import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { TopologyParser } from '../../src/reactTopoViewer/shared/parsing';
import {
  NodeFsAdapter,
  TopologyAnnotations,
  NodeSaveData,
  LinkSaveData,
  SaveResult,
  IOLogger,
  AnnotationsIO,
  TopologyIO,
} from '../../src/reactTopoViewer/shared/io';
import {
  SessionFsAdapter,
  SessionMaps,
  createSessionMaps,
  resetSession,
} from './SessionFsAdapter';

const TOPOLOGIES_DIR = path.join(__dirname, '../topologies');
const TOPOLOGIES_ORIGINAL_DIR = path.join(__dirname, '../topologies-original');

// ============================================================================
// Session Management
// ============================================================================

// Shared session maps for all sessions
const sessionMaps: SessionMaps = createSessionMaps();

/**
 * Create logger for services
 */
function createServiceLogger(prefix: string): IOLogger {
  return {
    debug: (msg: string) => console.log(`[${prefix}:Debug]`, msg),
    info: (msg: string) => console.log(`[${prefix}:Info]`, msg),
    warn: (msg: string) => console.warn(`[${prefix}:Warn]`, msg),
    error: (msg: string) => console.error(`[${prefix}:Error]`, msg),
  };
}

// Per-session AnnotationsIO instances
const sessionAnnotationsIOs = new Map<string, AnnotationsIO>();

// Default AnnotationsIO for non-session requests (uses disk directly)
const defaultAnnotationsIO = new AnnotationsIO({
  fs: new NodeFsAdapter(),
  logger: createServiceLogger('FileAPI'),
});

// Per-session+file TopologyIO instances
// Key format: `${sessionId}:${filename}` or `default:${filename}`
const topologyIOInstances = new Map<string, TopologyIO>();

/**
 * Get or create AnnotationsIO for a session
 */
function getAnnotationsIO(sessionId?: string): AnnotationsIO {
  if (!sessionId) {
    return defaultAnnotationsIO;
  }

  if (!sessionAnnotationsIOs.has(sessionId)) {
    const fsAdapter = new SessionFsAdapter(sessionId, sessionMaps, TOPOLOGIES_DIR);
    sessionAnnotationsIOs.set(sessionId, new AnnotationsIO({
      fs: fsAdapter,
      logger: createServiceLogger(`FileAPI:${sessionId}`),
    }));
  }

  return sessionAnnotationsIOs.get(sessionId)!;
}

/**
 * Get or create TopologyIO for a session+file
 * Initializes from the YAML file if needed
 */
async function getTopologyIO(filename: string, sessionId?: string): Promise<TopologyIO | null> {
  const key = `${sessionId || 'default'}:${filename}`;

  if (!topologyIOInstances.has(key)) {
    const fsAdapter = getFsAdapter(sessionId);
    const annotationsIO = getAnnotationsIO(sessionId);
    const prefix = sessionId ? `TopologyIO:${sessionId}` : 'TopologyIO';

    const service = new TopologyIO({
      fs: fsAdapter,
      annotationsIO: annotationsIO,
      logger: createServiceLogger(prefix),
    });

    // Initialize from file
    const filePath = path.join(TOPOLOGIES_DIR, filename);
    try {
      const yamlContent = await fsAdapter.readFile(filePath);
      const doc = YAML.parseDocument(yamlContent);
      service.initialize(doc, filePath);
      topologyIOInstances.set(key, service);
    } catch (err) {
      console.error(`[FileAPI] Failed to initialize TopologyIO for ${filename}:`, err);
      return null;
    }
  }

  return topologyIOInstances.get(key)!;
}

/**
 * Clear service instances for a session (call after reset)
 */
function clearServicesForSession(sessionId?: string): void {
  const prefix = `${sessionId || 'default'}:`;
  for (const key of topologyIOInstances.keys()) {
    if (key.startsWith(prefix)) {
      topologyIOInstances.delete(key);
    }
  }
  if (sessionId) {
    const io = sessionAnnotationsIOs.get(sessionId);
    if (io) io.clearCache();
  } else {
    defaultAnnotationsIO.clearCache();
  }
}

/**
 * Get file system adapter for a session
 */
function getFsAdapter(sessionId?: string): SessionFsAdapter | NodeFsAdapter {
  if (sessionId) {
    return new SessionFsAdapter(sessionId, sessionMaps, TOPOLOGIES_DIR);
  }
  return new NodeFsAdapter();
}

// ============================================================================
// Reset Functionality
// ============================================================================

/**
 * Reset all disk files to their original state (from topologies-original folder)
 */
async function resetDiskFiles(): Promise<void> {
  console.log('[FileAPI] Resetting disk files from topologies-original...');

  try {
    // First, delete all annotation files in topologies (clean slate)
    const currentFiles = await fs.promises.readdir(TOPOLOGIES_DIR);
    for (const file of currentFiles) {
      if (file.endsWith('.annotations.json')) {
        const filePath = path.join(TOPOLOGIES_DIR, file);
        try {
          await fs.promises.unlink(filePath);
          console.log('[FileAPI] Deleted:', file);
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

      const content = await fs.promises.readFile(srcPath, 'utf8');
      await fs.promises.writeFile(destPath, content, 'utf8');
      console.log('[FileAPI] Restored:', file);
    }

    console.log('[FileAPI] Disk reset complete');
  } catch (err) {
    console.error('[FileAPI] Failed to reset disk files:', err);
    throw err;
  }
}

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface TopologyFile {
  filename: string;
  hasAnnotations: boolean;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * List all .clab.yml files (from session + disk)
 */
async function listTopologyFiles(sessionId?: string): Promise<TopologyFile[]> {
  try {
    // Always read disk files as base
    const files = await fs.promises.readdir(TOPOLOGIES_DIR);
    const diskYamlFiles = files.filter(f => f.endsWith('.clab.yml'));

    // If session exists, merge with session storage (session takes priority)
    if (sessionId && sessionMaps.yamlFiles.has(sessionId)) {
      const yamlMap = sessionMaps.yamlFiles.get(sessionId)!;
      const annotMap = sessionMaps.annotationFiles.get(sessionId)!;

      // Start with disk files
      const allFiles = new Set(diskYamlFiles);
      // Add any session-only files
      for (const filename of yamlMap.keys()) {
        if (filename.endsWith('.clab.yml')) {
          allFiles.add(filename);
        }
      }

      return Array.from(allFiles).map(filename => ({
        filename,
        // Check session annotations first, then fall back to disk
        hasAnnotations: annotMap.has(filename)
          ? annotMap.get(filename) !== null
          : files.includes(`${filename}.annotations.json`)
      }));
    }

    // No session - just return disk files
    return diskYamlFiles.map(filename => ({
      filename,
      hasAnnotations: files.includes(`${filename}.annotations.json`)
    }));
  } catch (err) {
    console.error('[FileAPI] Failed to list topologies:', err);
    return [];
  }
}

/**
 * Read a YAML file (from session or disk)
 */
async function readYamlFile(filename: string, sessionId?: string): Promise<ApiResponse<{ content: string }>> {
  try {
    const fsAdapter = getFsAdapter(sessionId);
    const filePath = path.join(TOPOLOGIES_DIR, filename);

    // Security: ensure we're not escaping the topologies directory
    if (!filePath.startsWith(TOPOLOGIES_DIR)) {
      return { success: false, error: 'Invalid file path' };
    }

    const content = await fsAdapter.readFile(filePath);
    return { success: true, data: { content } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Write a YAML file (to session or disk)
 */
async function writeYamlFile(
  filename: string,
  content: string,
  sessionId?: string
): Promise<ApiResponse> {
  try {
    const fsAdapter = getFsAdapter(sessionId);
    const filePath = path.join(TOPOLOGIES_DIR, filename);

    // Security: ensure we're not escaping the topologies directory
    if (!filePath.startsWith(TOPOLOGIES_DIR)) {
      return { success: false, error: 'Invalid file path' };
    }

    // Compare with existing content to avoid unnecessary writes
    try {
      const existingContent = await fsAdapter.readFile(filePath);
      if (existingContent === content) {
        console.log('[FileAPI] Skipping write - content unchanged:', filename);
        return { success: true, data: { skipped: true } };
      }
    } catch {
      // File doesn't exist, will create it
    }

    await fsAdapter.writeFile(filePath, content);
    console.log('[FileAPI] Wrote YAML file:', filename);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Read annotations using the shared AnnotationsIO
 */
async function readAnnotations(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse<Record<string, unknown>>> {
  try {
    const manager = getAnnotationsIO(sessionId);
    const yamlFilePath = path.join(TOPOLOGIES_DIR, yamlFilename);
    const annotations = await manager.loadAnnotations(yamlFilePath);
    return { success: true, data: annotations as Record<string, unknown> };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Get parsed topology elements (YAML + annotations combined)
 */
async function getTopologyElements(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse<{ elements: unknown[]; annotations: unknown; labName: string }>> {
  // Read YAML
  const yamlResult = await readYamlFile(yamlFilename, sessionId);
  if (!yamlResult.success || !yamlResult.data) {
    return { success: false, error: yamlResult.error || 'Failed to read YAML' };
  }

  // Read annotations using shared AnnotationsIO
  const manager = getAnnotationsIO(sessionId);
  const yamlFilePath = path.join(TOPOLOGIES_DIR, yamlFilename);
  const annotations = await manager.loadAnnotations(yamlFilePath);

  try {
    // Parse and return elements using the shared parser
    const result = TopologyParser.parse(yamlResult.data.content, {
      annotations: annotations as TopologyAnnotations,
    });
    return {
      success: true,
      data: {
        elements: result.elements,
        annotations: annotations,
        labName: result.labName
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Parse error: ${message}` };
  }
}

/**
 * Write annotations using the shared AnnotationsIO
 */
async function writeAnnotations(
  yamlFilename: string,
  annotations: Record<string, unknown>,
  sessionId?: string
): Promise<ApiResponse> {
  try {
    const manager = getAnnotationsIO(sessionId);
    const yamlFilePath = path.join(TOPOLOGIES_DIR, yamlFilename);
    await manager.saveAnnotations(yamlFilePath, annotations as TopologyAnnotations);
    console.log('[FileAPI] Saved annotations:', yamlFilename);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Delete annotations file
 */
async function deleteAnnotations(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse> {
  try {
    const fsAdapter = getFsAdapter(sessionId);
    const annotationsPath = path.join(TOPOLOGIES_DIR, `${yamlFilename}.annotations.json`);
    await fsAdapter.unlink(annotationsPath);
    console.log('[FileAPI] Deleted annotations:', yamlFilename);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Don't treat "file doesn't exist" as an error
    if (message.includes('ENOENT')) {
      return { success: true };
    }
    return { success: false, error: message };
  }
}

/**
 * Check if annotations file exists
 */
async function annotationsExists(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse<{ exists: boolean }>> {
  try {
    const fsAdapter = getFsAdapter(sessionId);
    const annotationsPath = path.join(TOPOLOGIES_DIR, `${yamlFilename}.annotations.json`);
    const exists = await fsAdapter.exists(annotationsPath);
    return { success: true, data: { exists } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// TopologyIO Operations (unified with VS Code extension)
// ============================================================================

/**
 * Add a node via TopologyIO
 */
async function addNode(
  yamlFilename: string,
  nodeData: NodeSaveData,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.addNode(nodeData);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Edit a node via TopologyIO
 */
async function editNode(
  yamlFilename: string,
  nodeData: NodeSaveData,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.editNode(nodeData);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Delete a node via TopologyIO
 */
async function deleteNode(
  yamlFilename: string,
  nodeId: string,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.deleteNode(nodeId);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Add a link via TopologyIO
 */
async function addLink(
  yamlFilename: string,
  linkData: LinkSaveData,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.addLink(linkData);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Edit a link via TopologyIO
 */
async function editLink(
  yamlFilename: string,
  linkData: LinkSaveData,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.editLink(linkData);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Delete a link via TopologyIO
 */
async function deleteLink(
  yamlFilename: string,
  linkData: LinkSaveData,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.deleteLink(linkData);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Begin batch operation via TopologyIO
 */
async function beginBatch(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  service.beginBatch();
  return { success: true };
}

/**
 * End batch operation via TopologyIO
 */
async function endBatch(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.endBatch();
  return { success: result.success, data: result, error: result.error };
}

/**
 * Save node positions via TopologyIO
 */
async function savePositions(
  yamlFilename: string,
  positions: Array<{ id: string; position: { x: number; y: number } }>,
  sessionId?: string
): Promise<ApiResponse<SaveResult>> {
  const service = await getTopologyIO(yamlFilename, sessionId);
  if (!service) {
    return { success: false, error: 'Failed to initialize TopologyIO' };
  }
  const result = await service.savePositions(positions);
  return { success: result.success, data: result, error: result.error };
}

/**
 * Save lab settings (name, prefix, mgmt) to YAML file
 * Mirrors the extension's yamlSettingsManager behavior
 */
async function saveLabSettings(
  yamlFilename: string,
  settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null },
  sessionId?: string
): Promise<ApiResponse<void>> {
  try {
    const fsAdapter = getFsAdapter(sessionId);
    const filePath = path.join(TOPOLOGIES_DIR, yamlFilename);

    // Read current YAML content
    const yamlContent = await fsAdapter.readFile(filePath);
    const doc = YAML.parseDocument(yamlContent);

    // Update name if provided
    if (settings.name !== undefined) {
      doc.set('name', settings.name);
    }

    // Handle prefix setting
    if (settings.prefix !== undefined) {
      if (settings.prefix === null || settings.prefix === '') {
        // Remove prefix if null/empty
        doc.delete('prefix');
      } else {
        doc.set('prefix', settings.prefix);
      }
    }

    // Handle mgmt setting
    if (settings.mgmt !== undefined) {
      const topoNode = doc.get('topology');
      if (YAML.isMap(topoNode)) {
        if (settings.mgmt === null) {
          // Remove mgmt if null
          topoNode.delete('mgmt');
        } else {
          topoNode.set('mgmt', settings.mgmt);
        }
      }
    }

    // Write back to file
    await fsAdapter.writeFile(filePath, doc.toString());
    console.log('[FileAPI] Lab settings saved to', yamlFilename);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[FileAPI] Failed to save lab settings:', message);
    return { success: false, error: message };
  }
}

// ============================================================================
// Vite Plugin
// ============================================================================

/**
 * Extract session ID from request (header or query param)
 */
function getSessionId(req: import('http').IncomingMessage, url: string): string | undefined {
  // Check X-Session-ID header first
  const headerSession = req.headers['x-session-id'];
  if (headerSession && typeof headerSession === 'string') {
    return headerSession;
  }

  // Check query parameter
  const urlObj = new URL(url, 'http://localhost');
  return urlObj.searchParams.get('sessionId') || undefined;
}

/**
 * Vite plugin that adds API middleware for file operations
 */
export function fileApiPlugin(): Plugin {
  return {
    name: 'file-api',
    configureServer(server) {
      // Add middleware before Vite's default handling
      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || '';

        // Only handle /api/* routes
        if (!fullUrl.startsWith('/api/')) {
          return next();
        }

        // Parse URL without query string for route matching
        const urlWithoutQuery = fullUrl.split('?')[0];
        const sessionId = getSessionId(req, fullUrl);

        // Set JSON content type
        res.setHeader('Content-Type', 'application/json');

        try {
          // POST /api/reset - Reset files to original state
          if (urlWithoutQuery === '/api/reset' && req.method === 'POST') {
            if (sessionId) {
              // Reset session to use current disk files
              await resetSession(sessionId, sessionMaps, TOPOLOGIES_DIR);
              // Clear service instances for this session
              clearServicesForSession(sessionId);
              res.end(JSON.stringify({ success: true, sessionId }));
            } else {
              // Reset disk files to original state (from server startup)
              await resetDiskFiles();
              // Clear default service instances
              clearServicesForSession(undefined);
              res.end(JSON.stringify({ success: true, message: 'Disk files reset to original state' }));
            }
            return;
          }

          // GET /api/topologies - List available topology files
          if (urlWithoutQuery === '/api/topologies' && req.method === 'GET') {
            const files = await listTopologyFiles(sessionId);
            res.end(JSON.stringify({ success: true, data: files }));
            return;
          }

          // GET /api/topology/:filename - Read YAML file
          const readYamlMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)$/);
          if (readYamlMatch && req.method === 'GET') {
            const filename = decodeURIComponent(readYamlMatch[1]);
            const result = await readYamlFile(filename, sessionId);
            res.statusCode = result.success ? 200 : 404;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename - Write YAML file
          if (readYamlMatch && req.method === 'POST') {
            const filename = decodeURIComponent(readYamlMatch[1]);
            const body = await parseJsonBody(req);
            const result = await writeYamlFile(filename, body.content, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // GET /api/annotations/:filename - Read annotations
          const readAnnotMatch = urlWithoutQuery.match(/^\/api\/annotations\/([^/]+)$/);
          if (readAnnotMatch && req.method === 'GET') {
            const filename = decodeURIComponent(readAnnotMatch[1]);
            const result = await readAnnotations(filename, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/annotations/:filename - Write annotations
          if (readAnnotMatch && req.method === 'POST') {
            const filename = decodeURIComponent(readAnnotMatch[1]);
            const body = await parseJsonBody(req);
            const result = await writeAnnotations(filename, body, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // DELETE /api/annotations/:filename - Delete annotations file
          if (readAnnotMatch && req.method === 'DELETE') {
            const filename = decodeURIComponent(readAnnotMatch[1]);
            const result = await deleteAnnotations(filename, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // GET /api/annotations/:filename/exists - Check if annotations file exists
          const annotExistsMatch = urlWithoutQuery.match(/^\/api\/annotations\/([^/]+)\/exists$/);
          if (annotExistsMatch && req.method === 'GET') {
            const filename = decodeURIComponent(annotExistsMatch[1]);
            const result = await annotationsExists(filename, sessionId);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
            return;
          }

          // GET /api/topology/:filename/elements - Parse and return Cytoscape elements
          const elementsMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/elements$/);
          if (elementsMatch && req.method === 'GET') {
            const filename = decodeURIComponent(elementsMatch[1]);
            const result = await getTopologyElements(filename, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // ============================================================================
          // TopologyIO Operations (unified with VS Code extension)
          // ============================================================================

          // POST /api/topology/:filename/node - Add node via TopologyIO
          const nodeMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/node$/);
          if (nodeMatch && req.method === 'POST') {
            const filename = decodeURIComponent(nodeMatch[1]);
            const body = await parseJsonBody(req);
            const result = await addNode(filename, body as NodeSaveData, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // PUT /api/topology/:filename/node - Edit node via TopologyIO
          if (nodeMatch && req.method === 'PUT') {
            const filename = decodeURIComponent(nodeMatch[1]);
            const body = await parseJsonBody(req);
            const result = await editNode(filename, body as NodeSaveData, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // DELETE /api/topology/:filename/node/:nodeId - Delete node via TopologyIO
          const deleteNodeMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/node\/([^/]+)$/);
          if (deleteNodeMatch && req.method === 'DELETE') {
            const filename = decodeURIComponent(deleteNodeMatch[1]);
            const nodeId = decodeURIComponent(deleteNodeMatch[2]);
            const result = await deleteNode(filename, nodeId, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename/link - Add link via TopologyIO
          const linkMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/link$/);
          if (linkMatch && req.method === 'POST') {
            const filename = decodeURIComponent(linkMatch[1]);
            const body = await parseJsonBody(req);
            const result = await addLink(filename, body as LinkSaveData, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // PUT /api/topology/:filename/link - Edit link via TopologyIO
          if (linkMatch && req.method === 'PUT') {
            const filename = decodeURIComponent(linkMatch[1]);
            const body = await parseJsonBody(req);
            const result = await editLink(filename, body as LinkSaveData, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // DELETE /api/topology/:filename/link - Delete link via TopologyIO
          if (linkMatch && req.method === 'DELETE') {
            const filename = decodeURIComponent(linkMatch[1]);
            const body = await parseJsonBody(req);
            const result = await deleteLink(filename, body as LinkSaveData, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename/batch/begin - Begin batch via TopologyIO
          const batchBeginMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/batch\/begin$/);
          if (batchBeginMatch && req.method === 'POST') {
            const filename = decodeURIComponent(batchBeginMatch[1]);
            const result = await beginBatch(filename, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename/batch/end - End batch via TopologyIO
          const batchEndMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/batch\/end$/);
          if (batchEndMatch && req.method === 'POST') {
            const filename = decodeURIComponent(batchEndMatch[1]);
            const result = await endBatch(filename, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename/positions - Save positions via TopologyIO
          const positionsMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/positions$/);
          if (positionsMatch && req.method === 'POST') {
            const filename = decodeURIComponent(positionsMatch[1]);
            const body = await parseJsonBody(req);
            const positions = body.positions as Array<{ id: string; position: { x: number; y: number } }>;
            const result = await savePositions(filename, positions, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // POST /api/topology/:filename/settings - Save lab settings to YAML
          const settingsMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/settings$/);
          if (settingsMatch && req.method === 'POST') {
            const filename = decodeURIComponent(settingsMatch[1]);
            const body = await parseJsonBody(req);
            const settings = body as { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null };
            const result = await saveLabSettings(filename, settings, sessionId);
            res.statusCode = result.success ? 200 : 500;
            res.end(JSON.stringify(result));
            return;
          }

          // 404 for unknown API routes
          res.statusCode = 404;
          res.end(JSON.stringify({ success: false, error: 'Not found' }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: message }));
        }
      });
    }
  };
}

/**
 * Parse JSON body from request
 */
function parseJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
