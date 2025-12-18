/**
 * Vite API Middleware for File Operations
 *
 * Provides REST endpoints to read/write YAML and annotation files,
 * mimicking the real VS Code extension's file I/O behavior.
 */

import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import { parseTopology, generateYaml, TopologyAnnotations } from './TopologyParser';

const TOPOLOGIES_DIR = path.join(__dirname, '../topologies');
const TOPOLOGIES_ORIGINAL_DIR = path.join(__dirname, '../topologies-original');

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
// Session-based File Isolation
// ============================================================================

// In-memory storage for session-specific file state
// Key: sessionId, Value: Map<filename, content>
const sessionYamlFiles = new Map<string, Map<string, string>>();
const sessionAnnotationFiles = new Map<string, Map<string, object | null>>();

/**
 * Get or create session storage
 */
function getSessionYaml(sessionId: string): Map<string, string> {
  if (!sessionYamlFiles.has(sessionId)) {
    // Initialize with defaults
    const yamlMap = new Map<string, string>();
    sessionYamlFiles.set(sessionId, yamlMap);
  }
  return sessionYamlFiles.get(sessionId)!;
}

function getSessionAnnotations(sessionId: string): Map<string, object | null> {
  if (!sessionAnnotationFiles.has(sessionId)) {
    const annotMap = new Map<string, object | null>();
    sessionAnnotationFiles.set(sessionId, annotMap);
  }
  return sessionAnnotationFiles.get(sessionId)!;
}

/**
 * Reset session to use disk files (copy disk state to session)
 */
async function resetSession(sessionId: string): Promise<void> {
  const yamlMap = getSessionYaml(sessionId);
  const annotMap = getSessionAnnotations(sessionId);

  yamlMap.clear();
  annotMap.clear();

  // Copy disk files to session
  try {
    const files = await fs.promises.readdir(TOPOLOGIES_DIR);
    const yamlFiles = files.filter(f => f.endsWith('.clab.yml'));

    for (const filename of yamlFiles) {
      // Read YAML
      const yamlPath = path.join(TOPOLOGIES_DIR, filename);
      const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
      yamlMap.set(filename, yamlContent);

      // Read annotations if they exist
      const annotPath = path.join(TOPOLOGIES_DIR, `${filename}.annotations.json`);
      try {
        const annotContent = await fs.promises.readFile(annotPath, 'utf8');
        annotMap.set(filename, JSON.parse(annotContent));
      } catch {
        // No annotations file - that's fine
        annotMap.set(filename, null);
      }
    }
  } catch (err) {
    console.error(`[FileAPI] Failed to reset session ${sessionId}:`, err);
  }

  console.log(`[FileAPI] Reset session: ${sessionId}`);
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
    if (sessionId && sessionYamlFiles.has(sessionId)) {
      const yamlMap = getSessionYaml(sessionId);
      const annotMap = getSessionAnnotations(sessionId);

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
  // Check session storage first
  if (sessionId && sessionYamlFiles.has(sessionId)) {
    const yamlMap = getSessionYaml(sessionId);
    if (yamlMap.has(filename)) {
      return { success: true, data: { content: yamlMap.get(filename)! } };
    }
    // File not in session - try to load from disk into session
    const filePath = path.join(TOPOLOGIES_DIR, filename);
    if (filePath.startsWith(TOPOLOGIES_DIR)) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        yamlMap.set(filename, content);
        return { success: true, data: { content } };
      } catch {
        return { success: false, error: `File not found: ${filename}` };
      }
    }
  }

  // Fall back to disk read
  const filePath = path.join(TOPOLOGIES_DIR, filename);

  // Security: ensure we're not escaping the topologies directory
  if (!filePath.startsWith(TOPOLOGIES_DIR)) {
    return { success: false, error: 'Invalid file path' };
  }

  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
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
  // Write to session storage if session exists
  if (sessionId && sessionYamlFiles.has(sessionId)) {
    const yamlMap = getSessionYaml(sessionId);
    const existing = yamlMap.get(filename);
    if (existing === content) {
      console.log(`[FileAPI] Session ${sessionId}: Skipping write - content unchanged:`, filename);
      return { success: true, data: { skipped: true } };
    }
    yamlMap.set(filename, content);
    console.log(`[FileAPI] Session ${sessionId}: Wrote YAML:`, filename);
    return { success: true };
  }

  // Fall back to disk write
  const filePath = path.join(TOPOLOGIES_DIR, filename);

  // Security: ensure we're not escaping the topologies directory
  if (!filePath.startsWith(TOPOLOGIES_DIR)) {
    return { success: false, error: 'Invalid file path' };
  }

  try {
    // Compare with existing content to avoid unnecessary writes
    try {
      const existingContent = await fs.promises.readFile(filePath, 'utf8');
      if (existingContent === content) {
        console.log('[FileAPI] Skipping write - content unchanged:', filename);
        return { success: true, data: { skipped: true } };
      }
    } catch {
      // File doesn't exist, will create it
    }

    await fs.promises.writeFile(filePath, content, 'utf8');
    console.log('[FileAPI] Wrote YAML file:', filename);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Get annotations file path for a YAML file
 */
function getAnnotationsPath(yamlFilename: string): string {
  return path.join(TOPOLOGIES_DIR, `${yamlFilename}.annotations.json`);
}

/**
 * Read annotations (from session or disk)
 */
async function readAnnotations(
  yamlFilename: string,
  sessionId?: string
): Promise<ApiResponse<Record<string, unknown>>> {
  const emptyAnnotations = {
    freeTextAnnotations: [],
    freeShapeAnnotations: [],
    groupStyleAnnotations: [],
    networkNodeAnnotations: [],
    nodeAnnotations: [],
    aliasEndpointAnnotations: []
  };

  // Check session storage first
  if (sessionId && sessionAnnotationFiles.has(sessionId)) {
    const annotMap = getSessionAnnotations(sessionId);
    if (annotMap.has(yamlFilename)) {
      const annotations = annotMap.get(yamlFilename);
      if (annotations === null) {
        return { success: true, data: emptyAnnotations };
      }
      return { success: true, data: annotations as Record<string, unknown> };
    }
    // File not in session - try to load from disk into session
    const filePath = getAnnotationsPath(yamlFilename);
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const annotations = JSON.parse(content);
      annotMap.set(yamlFilename, annotations);
      return { success: true, data: annotations };
    } catch {
      annotMap.set(yamlFilename, null);
      return { success: true, data: emptyAnnotations };
    }
  }

  // Fall back to disk read
  const filePath = getAnnotationsPath(yamlFilename);

  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const annotations = JSON.parse(content);
    return { success: true, data: annotations };
  } catch (err) {
    // Return empty annotations if file doesn't exist (not an error)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, data: emptyAnnotations };
    }

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

  // Read annotations
  const annotResult = await readAnnotations(yamlFilename, sessionId);
  const annotations = annotResult.data || {};

  try {
    // Parse and return elements
    const result = parseTopology(yamlResult.data.content, annotations as TopologyAnnotations);
    return {
      success: true,
      data: {
        elements: result.elements,
        annotations: result.annotations,
        labName: result.labName
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Parse error: ${message}` };
  }
}

/**
 * Write annotations (to session or disk)
 */
async function writeAnnotations(
  yamlFilename: string,
  annotations: Record<string, unknown>,
  sessionId?: string
): Promise<ApiResponse> {
  // Check if annotations are empty
  const isEmpty = Object.values(annotations).every(
    v => !v || (Array.isArray(v) && v.length === 0)
  );

  // Write to session storage if session exists
  if (sessionId && sessionAnnotationFiles.has(sessionId)) {
    const annotMap = getSessionAnnotations(sessionId);
    if (isEmpty) {
      annotMap.set(yamlFilename, null);
      console.log(`[FileAPI] Session ${sessionId}: Cleared annotations:`, yamlFilename);
    } else {
      annotMap.set(yamlFilename, annotations);
      console.log(`[FileAPI] Session ${sessionId}: Wrote annotations:`, yamlFilename);
    }
    return { success: true };
  }

  // Fall back to disk write
  const filePath = getAnnotationsPath(yamlFilename);
  const content = JSON.stringify(annotations, null, 2);

  try {
    // Compare with existing content
    try {
      const existingContent = await fs.promises.readFile(filePath, 'utf8');
      if (existingContent === content) {
        console.log('[FileAPI] Skipping write - annotations unchanged:', yamlFilename);
        return { success: true, data: { skipped: true } };
      }
    } catch {
      // File doesn't exist, will create it
    }

    if (isEmpty) {
      try {
        await fs.promises.unlink(filePath);
        console.log('[FileAPI] Deleted empty annotations file:', yamlFilename);
      } catch {
        // File didn't exist, nothing to delete
      }
      return { success: true };
    }

    await fs.promises.writeFile(filePath, content, 'utf8');
    console.log('[FileAPI] Wrote annotations file:', yamlFilename);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
              await resetSession(sessionId);
              res.end(JSON.stringify({ success: true, sessionId }));
            } else {
              // Reset disk files to original state (from server startup)
              await resetDiskFiles();
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

          // GET /api/topology/:filename/elements - Parse and return Cytoscape elements
          const elementsMatch = urlWithoutQuery.match(/^\/api\/topology\/([^/]+)\/elements$/);
          if (elementsMatch && req.method === 'GET') {
            const filename = decodeURIComponent(elementsMatch[1]);
            const result = await getTopologyElements(filename, sessionId);
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
function parseJsonBody(req: import('http').IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
