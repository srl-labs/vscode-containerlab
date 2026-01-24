/**
 * Services Module Stub for Testing
 *
 * This stub initializes the services with a mock adapter and stubs the
 * underlying TopologyIO methods to track calls for test assertions.
 *
 * Note: We stub TopologyIO methods rather than the service wrapper functions
 * because ES module re-exports don't work well with sinon.stub().
 */

import sinon from "sinon";

import * as services from "../../../../src/reactTopoViewer/webview/services";
import type { FileSystemAdapter } from "../../../../src/reactTopoViewer/shared/io/types";

// Track all service calls for assertions
export interface ServiceCall {
  method: string;
  args: unknown[];
}

let serviceCalls: ServiceCall[] = [];
let stubs: sinon.SinonStub[] = [];

/**
 * Mock FileSystemAdapter that simulates successful file operations
 */
class MockFileSystemAdapter implements FileSystemAdapter {
  private files: Map<string, string> = new Map();

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      // Return empty YAML structure for any file
      return "name: test\ntopology:\n  nodes: {}\n  links: []\n";
    }
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
  }

  async unlink(filePath: string): Promise<void> {
    this.files.delete(filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  dirname(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (lastSlash === -1) return ".";
    if (lastSlash === 0) return "/";
    return filePath.substring(0, lastSlash);
  }

  basename(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    return filePath.substring(lastSlash + 1);
  }

  join(...segments: string[]): string {
    return segments.join("/").replace(/\/+/g, "/");
  }

  // Test utility: set file content
  setFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }
}

let mockAdapter: MockFileSystemAdapter | null = null;

/**
 * Sets up service stubs for testing.
 * Initializes services with a mock adapter and stubs the TopologyIO methods
 * to track calls.
 */
export function setupServiceStubs(): void {
  // Reset call tracking
  serviceCalls = [];

  // Create mock adapter and initialize services
  mockAdapter = new MockFileSystemAdapter();

  // Set up a basic topology file
  mockAdapter.setFile(
    "/test/lab.clab.yml",
    `name: test
topology:
  nodes:
    node1:
      kind: linux
    node2:
      kind: linux
  links:
    - endpoints: ["node1:e1-1", "node2:e1-1"]
`
  );

  // Initialize services with mock adapter
  services.resetServices();
  services.initializeServices(mockAdapter);

  // Get the TopologyIO instance and stub its methods
  // This works because the service wrapper functions call these methods
  const topologyIO = services.getTopologyIO();

  // Stub addNode (called by createNode)
  const originalAddNode = topologyIO.addNode.bind(topologyIO);
  const addNodeStub = sinon.stub(topologyIO, "addNode").callsFake(async (data) => {
    serviceCalls.push({ method: "createNode", args: [data] });
    return originalAddNode(data);
  });
  stubs.push(addNodeStub);

  // Stub editNode
  const originalEditNode = topologyIO.editNode.bind(topologyIO);
  const editNodeStub = sinon.stub(topologyIO, "editNode").callsFake(async (data) => {
    serviceCalls.push({ method: "editNode", args: [data] });
    return originalEditNode(data);
  });
  stubs.push(editNodeStub);

  // Stub addLink (called by createLink)
  const originalAddLink = topologyIO.addLink.bind(topologyIO);
  const addLinkStub = sinon.stub(topologyIO, "addLink").callsFake(async (data) => {
    serviceCalls.push({ method: "createLink", args: [data] });
    return originalAddLink(data);
  });
  stubs.push(addLinkStub);

  // Stub editLink
  const originalEditLink = topologyIO.editLink.bind(topologyIO);
  const editLinkStub = sinon.stub(topologyIO, "editLink").callsFake(async (data) => {
    serviceCalls.push({ method: "editLink", args: [data] });
    return originalEditLink(data);
  });
  stubs.push(editLinkStub);

  // Stub savePositions
  const originalSavePositions = topologyIO.savePositions.bind(topologyIO);
  const savePositionsStub = sinon.stub(topologyIO, "savePositions").callsFake(async (positions) => {
    serviceCalls.push({ method: "saveNodePositions", args: [positions] });
    return originalSavePositions(positions);
  });
  stubs.push(savePositionsStub);

  // Stub beginBatch
  const originalBeginBatch = topologyIO.beginBatch.bind(topologyIO);
  const beginBatchStub = sinon.stub(topologyIO, "beginBatch").callsFake(() => {
    serviceCalls.push({ method: "beginBatch", args: [] });
    return originalBeginBatch();
  });
  stubs.push(beginBatchStub);

  // Stub endBatch
  const originalEndBatch = topologyIO.endBatch.bind(topologyIO);
  const endBatchStub = sinon.stub(topologyIO, "endBatch").callsFake(async () => {
    serviceCalls.push({ method: "endBatch", args: [] });
    return originalEndBatch();
  });
  stubs.push(endBatchStub);
}

/**
 * Tears down service stubs.
 * Call this in afterEach() to clean up.
 */
export function teardownServiceStubs(): void {
  // Restore all stubs
  for (const stub of stubs) {
    stub.restore();
  }
  stubs = [];

  // Reset services
  services.resetServices();
  mockAdapter = null;
  serviceCalls = [];
}

/**
 * Gets all service calls made since setup.
 */
export function getServiceCalls(): ServiceCall[] {
  return [...serviceCalls];
}

/**
 * Gets service calls by method name.
 */
export function getServiceCallsByMethod(method: string): ServiceCall[] {
  return serviceCalls.filter((c) => c.method === method);
}

/**
 * Clears recorded service calls.
 */
export function clearServiceCalls(): void {
  serviceCalls = [];
}

/**
 * Gets the mock file system adapter.
 */
export function getMockAdapter(): MockFileSystemAdapter | null {
  return mockAdapter;
}
