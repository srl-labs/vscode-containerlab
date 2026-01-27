/**
 * Tests for useUndoRedo hook
 *
 * This test suite covers:
 * - Hook initialization and return values
 * - Snapshot capture and commit
 * - Undo/Redo operations
 * - Batch operations
 * - History limits
 */
import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import { JSDOM } from "jsdom";
import { renderHook, act } from "@testing-library/react";
import type { Node, Edge } from "@xyflow/react";

import { useUndoRedo } from "../../../../../src/reactTopoViewer/webview/hooks/state/useUndoRedo";
import { setupGlobalVscodeMock, teardownGlobalVscodeMock } from "../../helpers/vscode-webview-stub";
import { setupServiceStubs, teardownServiceStubs } from "../../helpers/services-stub";

// Setup jsdom for React Testing Library
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true
});

// Use Object.defineProperty for properties that may have getters
Object.defineProperty(globalThis, "document", { value: dom.window.document, writable: true });
Object.defineProperty(globalThis, "window", { value: dom.window, writable: true });
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});
Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, writable: true });
Object.defineProperty(globalThis, "Element", { value: dom.window.Element, writable: true });

// ============================================================================
// Test Helpers
// ============================================================================

type TestNode = Node<Record<string, unknown>>;
type TestEdge = Edge;

function createTestNode(id: string, x: number, y: number): TestNode {
  return {
    id,
    type: "topology-node",
    position: { x, y },
    data: { label: id, role: "pe" }
  };
}

interface MockGraphState {
  nodes: TestNode[];
  edges: TestEdge[];
}

function createMockOptions(state: MockGraphState) {
  return {
    enabled: true,
    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    setNodes: (updater: TestNode[] | ((nodes: TestNode[]) => TestNode[])) => {
      state.nodes = typeof updater === "function" ? updater(state.nodes) : updater;
    },
    setEdges: (updater: TestEdge[] | ((edges: TestEdge[]) => TestEdge[])) => {
      state.edges = typeof updater === "function" ? updater(state.edges) : updater;
    }
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("useUndoRedo", () => {
  beforeEach(() => {
    setupGlobalVscodeMock();
    setupServiceStubs();
  });

  afterEach(() => {
    teardownServiceStubs();
    teardownGlobalVscodeMock();
    sinon.restore();
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================
  describe("Initialization", () => {
    it("initializes with empty history", () => {
      const state: MockGraphState = { nodes: [], edges: [] };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      expect(result.current.canUndo).to.be.false;
      expect(result.current.canRedo).to.be.false;
      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(0);
    });

    it("provides all expected methods", () => {
      const state: MockGraphState = { nodes: [], edges: [] };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      expect(result.current.undo).to.be.a("function");
      expect(result.current.redo).to.be.a("function");
      expect(result.current.clearHistory).to.be.a("function");
      expect(result.current.captureSnapshot).to.be.a("function");
      expect(result.current.commitChange).to.be.a("function");
      expect(result.current.beginBatch).to.be.a("function");
      expect(result.current.endBatch).to.be.a("function");
      expect(result.current.isInBatch).to.be.a("function");
    });
  });

  // ==========================================================================
  // Snapshot and Commit Tests
  // ==========================================================================
  describe("Snapshot and Commit", () => {
    it("captureSnapshot captures current state", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      const snapshot = result.current.captureSnapshot({ includeAll: true });

      expect(snapshot.nodesBefore).to.have.lengthOf(1);
      expect(snapshot.nodesBefore[0].id).to.equal("node1");
      // The 'before' field contains the NodeSnapshot with position
      expect(snapshot.nodesBefore[0].before?.position).to.deep.equal({ x: 100, y: 100 });
    });

    it("commitChange adds to undo history", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // Capture before state
      const before = result.current.captureSnapshot({ includeAll: true });

      // Modify state
      state.nodes[0].position = { x: 200, y: 200 };

      // Commit change
      act(() => {
        result.current.commitChange(before, "Move node");
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.canUndo).to.be.true;
    });
  });

  // ==========================================================================
  // Undo/Redo Tests
  // ==========================================================================
  describe("Undo/Redo Operations", () => {
    it("undo restores previous state", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // Capture before, modify, commit
      const before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 200, y: 200 };
      act(() => {
        result.current.commitChange(before, "Move node");
      });

      // Undo
      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(1);
      expect(state.nodes[0].position).to.deep.equal({ x: 100, y: 100 });
    });

    it("redo restores undone state", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // Capture before, modify, commit
      const before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 200, y: 200 };
      act(() => {
        result.current.commitChange(before, "Move node");
      });

      // Undo then redo
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.redoCount).to.equal(0);
      expect(state.nodes[0].position).to.deep.equal({ x: 200, y: 200 });
    });

    it("new commit clears redo history", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // First change
      let before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 200, y: 200 };
      act(() => {
        result.current.commitChange(before, "Move 1");
      });

      // Undo
      act(() => {
        result.current.undo();
      });
      expect(result.current.redoCount).to.equal(1);

      // New change should clear redo
      before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 300, y: 300 };
      act(() => {
        result.current.commitChange(before, "Move 2");
      });

      expect(result.current.redoCount).to.equal(0);
    });

    it("undo does nothing with empty history", () => {
      const state: MockGraphState = { nodes: [], edges: [] };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.equal(0);
    });

    it("redo does nothing with empty future", () => {
      const state: MockGraphState = { nodes: [], edges: [] };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      act(() => {
        result.current.redo();
      });

      expect(result.current.redoCount).to.equal(0);
    });
  });

  // ==========================================================================
  // Batch Operations Tests
  // ==========================================================================
  describe("Batch Operations", () => {
    it("isInBatch returns correct state", () => {
      const state: MockGraphState = { nodes: [], edges: [] };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      expect(result.current.isInBatch()).to.be.false;

      act(() => {
        result.current.beginBatch();
      });
      expect(result.current.isInBatch()).to.be.true;

      act(() => {
        result.current.endBatch();
      });
      expect(result.current.isInBatch()).to.be.false;
    });

    it("batch merges multiple changes into single undo", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100), createTestNode("node2", 200, 200)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      act(() => {
        result.current.beginBatch();
      });

      // Multiple changes within batch
      let before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 150, y: 150 };
      act(() => {
        result.current.commitChange(before, "Move node1");
      });

      before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[1].position = { x: 250, y: 250 };
      act(() => {
        result.current.commitChange(before, "Move node2");
      });

      act(() => {
        result.current.endBatch();
      });

      // Should be single undo entry
      expect(result.current.undoCount).to.equal(1);
    });
  });

  // ==========================================================================
  // History Limits Tests
  // ==========================================================================
  describe("History Limits", () => {
    it("history is limited to 50 entries", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 0, 0)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // Make 51 changes
      for (let i = 0; i < 51; i++) {
        const before = result.current.captureSnapshot({ includeAll: true });
        state.nodes[0].position = { x: i * 10, y: i * 10 };
        act(() => {
          result.current.commitChange(before, `Move ${i}`);
        });
      }

      expect(result.current.undoCount).to.equal(50);
    });
  });

  // ==========================================================================
  // Clear History Tests
  // ==========================================================================
  describe("Clear History", () => {
    it("clearHistory empties both stacks", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const { result } = renderHook(() => useUndoRedo(createMockOptions(state)));

      // Add some history
      const before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 200, y: 200 };
      act(() => {
        result.current.commitChange(before, "Move");
      });
      act(() => {
        result.current.undo();
      });

      // After undo: undoCount=0, redoCount=1
      expect(result.current.redoCount).to.equal(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(0);
    });
  });

  // ==========================================================================
  // Disabled Mode Tests
  // ==========================================================================
  describe("Disabled Mode", () => {
    it("does not record changes when disabled", () => {
      const state: MockGraphState = {
        nodes: [createTestNode("node1", 100, 100)],
        edges: []
      };
      const options = createMockOptions(state);
      options.enabled = false;

      const { result } = renderHook(() => useUndoRedo(options));

      const before = result.current.captureSnapshot({ includeAll: true });
      state.nodes[0].position = { x: 200, y: 200 };
      act(() => {
        result.current.commitChange(before, "Move");
      });

      expect(result.current.undoCount).to.equal(0);
    });
  });
});
