/**
 * Services Module Stub for Testing
 *
 * This stub replaces the services module functions (createNode, editNode, etc.)
 * with stubs that capture calls for test assertions.
 */

import sinon from 'sinon';

import * as services from '../../../../src/reactTopoViewer/webview/services';
import type { FileSystemAdapter } from '../../../../src/reactTopoViewer/shared/io/types';
import type { NodeSaveData } from '../../../../src/reactTopoViewer/shared/io/NodePersistenceIO';
import type { LinkSaveData } from '../../../../src/reactTopoViewer/shared/io/LinkPersistenceIO';

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
      return 'name: test\ntopology:\n  nodes: {}\n  links: []\n';
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
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash === -1) return '.';
    if (lastSlash === 0) return '/';
    return filePath.substring(0, lastSlash);
  }

  basename(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return filePath.substring(lastSlash + 1);
  }

  join(...segments: string[]): string {
    return segments.join('/').replace(/\/+/g, '/');
  }

  // Test utility: set file content
  setFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }
}

let mockAdapter: MockFileSystemAdapter | null = null;

/**
 * Sets up service stubs for testing.
 * Initializes services with a mock adapter and stubs the service functions
 * to track calls.
 */
export function setupServiceStubs(): void {
  // Reset call tracking
  serviceCalls = [];

  // Create mock adapter and initialize services
  mockAdapter = new MockFileSystemAdapter();

  // Set up a basic topology file
  mockAdapter.setFile('/test/lab.clab.yml', `name: test
topology:
  nodes:
    node1:
      kind: linux
    node2:
      kind: linux
  links:
    - endpoints: ["node1:e1-1", "node2:e1-1"]
`);

  // Initialize services with mock adapter
  services.resetServices();
  services.initializeServices(mockAdapter);

  // Stub the service functions to track calls
  // We still let them execute but also track the call
  const originalCreateNode = services.createNode;
  const createNodeStub = sinon.stub(services, 'createNode').callsFake(async (data: NodeSaveData) => {
    serviceCalls.push({ method: 'createNode', args: [data] });
    return originalCreateNode.call(services, data);
  });
  stubs.push(createNodeStub);

  const originalEditNode = services.editNode;
  const editNodeStub = sinon.stub(services, 'editNode').callsFake(async (data: NodeSaveData) => {
    serviceCalls.push({ method: 'editNode', args: [data] });
    return originalEditNode.call(services, data);
  });
  stubs.push(editNodeStub);

  const originalCreateLink = services.createLink;
  const createLinkStub = sinon.stub(services, 'createLink').callsFake(async (data: LinkSaveData) => {
    serviceCalls.push({ method: 'createLink', args: [data] });
    return originalCreateLink.call(services, data);
  });
  stubs.push(createLinkStub);

  const originalEditLink = services.editLink;
  const editLinkStub = sinon.stub(services, 'editLink').callsFake(async (data: LinkSaveData) => {
    serviceCalls.push({ method: 'editLink', args: [data] });
    return originalEditLink.call(services, data);
  });
  stubs.push(editLinkStub);

  const originalSaveNodePositions = services.saveNodePositions;
  const saveNodePositionsStub = sinon.stub(services, 'saveNodePositions').callsFake(async (positions) => {
    serviceCalls.push({ method: 'saveNodePositions', args: [positions] });
    return originalSaveNodePositions.call(services, positions);
  });
  stubs.push(saveNodePositionsStub);

  const originalBeginBatch = services.beginBatch;
  const beginBatchStub = sinon.stub(services, 'beginBatch').callsFake(() => {
    serviceCalls.push({ method: 'beginBatch', args: [] });
    return originalBeginBatch.call(services);
  });
  stubs.push(beginBatchStub);

  const originalEndBatch = services.endBatch;
  const endBatchStub = sinon.stub(services, 'endBatch').callsFake(async () => {
    serviceCalls.push({ method: 'endBatch', args: [] });
    return originalEndBatch.call(services);
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
  return serviceCalls.filter(c => c.method === method);
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
