/**
 * Tests for useUndoRedo hook
 *
 * This test suite covers:
 * - Stack correctness (PUSH, UNDO, REDO, CLEAR transitions)
 * - History limits (MAX_HISTORY_SIZE=50)
 * - Future clearing behavior
 * - Return value API correctness
 * - Disabled mode behavior
 * - Missing Cytoscape handling
 * - Move action handling
 */
import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import { JSDOM } from "jsdom";
import { renderHook, act } from "@testing-library/react";

import { useUndoRedo } from "../../../../../src/reactTopoViewer/webview/hooks/state/useUndoRedo";
import { setupGlobalVscodeMock, teardownGlobalVscodeMock } from "../../helpers/vscode-webview-stub";
import {
  setupServiceStubs,
  teardownServiceStubs,
  getServiceCallsByMethod,
  clearServiceCalls
} from "../../helpers/services-stub";
import { createMoveAction, createMultipleMoveActions } from "../../helpers/undoRedo-fixtures";

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

// Constants to avoid duplicate strings
const GROUP_MOVE_TYPE = "group-move";

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
  // Stack Correctness Tests
  // ==========================================================================
  describe("Stack Correctness", () => {
    it("R-001: PUSH adds action to past stack", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      const action = createMoveAction();
      act(() => {
        result.current.pushAction(action);
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.canUndo).to.be.true;
    });

    it("R-002: PUSH clears future stack", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push first action
      act(() => {
        result.current.pushAction(createMoveAction());
      });

      // Undo to move it to future
      act(() => {
        result.current.undo();
      });
      expect(result.current.canRedo).to.be.true;
      expect(result.current.redoCount).to.equal(1);

      // Push new action - should clear future
      act(() => {
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.canRedo).to.be.false;
      expect(result.current.redoCount).to.equal(0);
    });

    it("R-003: UNDO moves last past to future", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.redoCount).to.equal(0);

      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(1);
      expect(result.current.canUndo).to.be.false;
      expect(result.current.canRedo).to.be.true;
    });

    it("R-004: REDO moves first future to past", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.redoCount).to.equal(1);

      act(() => {
        result.current.redo();
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.redoCount).to.equal(0);
      expect(result.current.canUndo).to.be.true;
      expect(result.current.canRedo).to.be.false;
    });

    it("R-005: UNDO on empty past returns same state", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      expect(result.current.undoCount).to.equal(0);

      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(0);
    });

    it("R-006: REDO on empty future returns same state", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.redoCount).to.equal(0);

      act(() => {
        result.current.redo();
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.redoCount).to.equal(0);
    });

    it("R-007: CLEAR resets to initial state", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Add some history
      act(() => {
        result.current.pushAction(createMoveAction());
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.be.greaterThan(0);
      expect(result.current.redoCount).to.be.greaterThan(0);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(0);
      expect(result.current.canUndo).to.be.false;
      expect(result.current.canRedo).to.be.false;
    });

    it("R-008: Multiple PUSH/UNDO/REDO cycle works correctly", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push 3 actions
      act(() => {
        result.current.pushAction(
          createMoveAction(
            [{ id: "node1", position: { x: 100, y: 100 } }],
            [{ id: "node1", position: { x: 110, y: 110 } }]
          )
        );
      });
      act(() => {
        result.current.pushAction(
          createMoveAction(
            [{ id: "node1", position: { x: 110, y: 110 } }],
            [{ id: "node1", position: { x: 120, y: 120 } }]
          )
        );
      });
      act(() => {
        result.current.pushAction(
          createMoveAction(
            [{ id: "node1", position: { x: 120, y: 120 } }],
            [{ id: "node1", position: { x: 130, y: 130 } }]
          )
        );
      });

      expect(result.current.undoCount).to.equal(3);

      // Undo twice
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.undoCount).to.equal(1);
      expect(result.current.redoCount).to.equal(2);

      // Redo once
      act(() => {
        result.current.redo();
      });

      expect(result.current.undoCount).to.equal(2);
      expect(result.current.redoCount).to.equal(1);

      // Push new action (should clear remaining future)
      act(() => {
        result.current.pushAction(
          createMoveAction(
            [{ id: "node1", position: { x: 120, y: 120 } }],
            [{ id: "node1", position: { x: 200, y: 200 } }]
          )
        );
      });

      expect(result.current.undoCount).to.equal(3);
      expect(result.current.redoCount).to.equal(0);
    });
  });

  // ==========================================================================
  // History Limits Tests
  // ==========================================================================
  describe("History Limits", () => {
    it("H-001: History limited to MAX_HISTORY_SIZE (50)", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push 51 actions using for...of to avoid nested function depth
      const actions = createMultipleMoveActions(51);
      for (const action of actions) {
        act(() => result.current.pushAction(action));
      }

      expect(result.current.undoCount).to.equal(50);
    });

    it("H-002: Oldest items removed on overflow (FIFO)", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push 51 actions with distinct positions
      for (let i = 0; i < 51; i++) {
        act(() => {
          result.current.pushAction(
            createMoveAction(
              [{ id: "node0", position: { x: i, y: i } }],
              [{ id: "node0", position: { x: i + 100, y: i + 100 } }]
            )
          );
        });
      }

      // Should have 50 items (first one removed)
      expect(result.current.undoCount).to.equal(50);

      // Undo all 50 times - should work
      for (let i = 0; i < 50; i++) {
        act(() => {
          result.current.undo();
        });
      }

      expect(result.current.undoCount).to.equal(0);
      expect(result.current.redoCount).to.equal(50);
    });

    it("H-003: Future stack not limited", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push 50 actions (max history)
      for (let i = 0; i < 50; i++) {
        act(() => {
          result.current.pushAction(
            createMoveAction(
              [{ id: "node0", position: { x: i, y: i } }],
              [{ id: "node0", position: { x: i + 1, y: i + 1 } }]
            )
          );
        });
      }

      // Undo all 50
      for (let i = 0; i < 50; i++) {
        act(() => {
          result.current.undo();
        });
      }

      // Future should have all 50
      expect(result.current.redoCount).to.equal(50);
    });

    it("H-004: Boundary at exactly 50 items - no eviction", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      // Push exactly 50 actions
      for (let i = 0; i < 50; i++) {
        act(() => {
          result.current.pushAction(
            createMoveAction(
              [{ id: "node0", position: { x: i, y: i } }],
              [{ id: "node0", position: { x: i + 1, y: i + 1 } }]
            )
          );
        });
      }

      expect(result.current.undoCount).to.equal(50);

      // Push 51st - should evict oldest
      act(() => {
        result.current.pushAction(
          createMoveAction(
            [{ id: "node0", position: { x: 50, y: 50 } }],
            [{ id: "node0", position: { x: 51, y: 51 } }]
          )
        );
      });

      expect(result.current.undoCount).to.equal(50);
    });
  });

  // ==========================================================================
  // Return Value API Tests
  // ==========================================================================
  describe("Return Value API", () => {
    it("A-001: Initial canUndo is false", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      expect(result.current.canUndo).to.be.false;
    });

    it("A-002: Initial canRedo is false", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      expect(result.current.canRedo).to.be.false;
    });

    it("A-003: canUndo true after pushAction", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.canUndo).to.be.true;
    });

    it("A-004: canRedo true after undo", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).to.be.true;
    });

    it("A-005: undoCount matches past length", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      expect(result.current.undoCount).to.equal(0);

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      expect(result.current.undoCount).to.equal(1);

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      expect(result.current.undoCount).to.equal(2);

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      expect(result.current.undoCount).to.equal(3);
    });

    it("A-006: redoCount matches future length", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
        result.current.pushAction(createMoveAction());
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.redoCount).to.equal(0);

      act(() => {
        result.current.undo();
      });
      expect(result.current.redoCount).to.equal(1);

      act(() => {
        result.current.undo();
      });
      expect(result.current.redoCount).to.equal(2);
    });
  });

  // ==========================================================================
  // Disabled Mode Tests
  // ==========================================================================
  describe("Disabled Mode", () => {
    it("D-001: pushAction no-ops when disabled", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: false }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });

      expect(result.current.undoCount).to.equal(0);
    });

    it("D-002: undo no-ops when disabled", () => {
      // Start enabled, push an action
      const { result, rerender } = renderHook(({ enabled }) => useUndoRedo({ enabled }), {
        initialProps: { enabled: true }
      });

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      expect(result.current.undoCount).to.equal(1);

      // Disable and try to undo
      rerender({ enabled: false });

      act(() => {
        result.current.undo();
      });

      // Undo should not have worked (canUndo is false when disabled)
      // The state still has the action but canUndo returns false
      expect(result.current.canUndo).to.be.false;
    });

    it("D-003: redo no-ops when disabled", () => {
      const { result, rerender } = renderHook(({ enabled }) => useUndoRedo({ enabled }), {
        initialProps: { enabled: true }
      });

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });
      expect(result.current.redoCount).to.equal(1);

      // Disable and try to redo
      rerender({ enabled: false });

      act(() => {
        result.current.redo();
      });

      expect(result.current.canRedo).to.be.false;
    });

    it("D-004: canUndo false when disabled even with past items", () => {
      const { result, rerender } = renderHook(({ enabled }) => useUndoRedo({ enabled }), {
        initialProps: { enabled: true }
      });

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      expect(result.current.canUndo).to.be.true;

      rerender({ enabled: false });

      expect(result.current.canUndo).to.be.false;
      expect(result.current.undoCount).to.equal(1); // State still has it
    });

    it("D-005: canRedo false when disabled even with future items", () => {
      const { result, rerender } = renderHook(({ enabled }) => useUndoRedo({ enabled }), {
        initialProps: { enabled: true }
      });

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });
      expect(result.current.canRedo).to.be.true;

      rerender({ enabled: false });

      expect(result.current.canRedo).to.be.false;
      expect(result.current.redoCount).to.equal(1); // State still has it
    });

    it.skip("D-006: recordMove no-ops when disabled [SKIPPED - Requires Cytoscape]", () => {
      // Test skipped - requires Cytoscape position tracking
    });
  });

  // ==========================================================================
  // Missing Cytoscape Tests
  // NOTE: These tests have been updated for ReactFlow migration.
  // The cy prop has been removed from useUndoRedo options.
  // ==========================================================================
  describe("Missing Cytoscape (ReactFlow migration)", () => {
    it("C-001: capturePositions returns empty array", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      const positions = result.current.capturePositions(["node1", "node2"]);

      expect(positions).to.deep.equal([]);
    });

    it("C-002: recordMove no-ops without node positions", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.recordMove(["node1"], [{ id: "node1", position: { x: 100, y: 100 } }]);
      });

      expect(result.current.undoCount).to.equal(0);
    });

    it("C-003: undo works with stack management", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });

      // Try to undo
      act(() => {
        result.current.undo();
      });

      // Undo count should decrease after undo
      expect(result.current.undoCount).to.equal(0);
    });

    it("C-004: redo works with stack management", () => {
      const { result } = renderHook(() => useUndoRedo({ enabled: true }));

      act(() => {
        result.current.pushAction(createMoveAction());
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.redoCount).to.equal(1);

      act(() => {
        result.current.redo();
      });

      // Redo count should decrease after redo
      expect(result.current.redoCount).to.equal(0);
    });
  });

  // ==========================================================================
  // Move Action Tests
  // NOTE: SKIPPED - These tests rely on Cytoscape position tracking
  // which has been removed during ReactFlow migration.
  // TODO: Re-enable when ReactFlow-based position tracking is implemented
  // ==========================================================================
  describe.skip("Move Actions [SKIPPED - Requires Cytoscape integration]", () => {
    it("M-001: recordMove creates move action with correct type", () => {
      /* Skipped */
    });
    it("M-002: recordMove works with multi-node moves", () => {
      /* Skipped */
    });
    it("M-003: recordMove no-ops if positions unchanged", () => {
      /* Skipped */
    });
    it("M-004: undo move restores before positions", () => {
      /* Skipped */
    });
    it("M-005: redo move restores after positions", () => {
      /* Skipped */
    });
    it("M-006: undo move calls saveNodePositions", () => {
      /* Skipped */
    });
    it("M-007: redo move calls saveNodePositions", () => {
      /* Skipped */
    });
    it("M-008: Move with membership changes records correctly", () => {
      /* Skipped */
    });
    it("M-009: Undo restores membership via applyMembershipChange callback", () => {
      /* Skipped */
    });
    it("M-010: Redo restores membership via applyMembershipChange callback", () => {
      /* Skipped */
    });
    it("M-011: Multi-node move in single action", () => {
      /* Skipped */
    });
  });

  // ==========================================================================
  // Graph Action Callback Tests
  // ==========================================================================
  describe("Graph Actions via Callbacks", () => {
    it("Graph actions call applyGraphChanges on undo", () => {
      const applyGraphChanges = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyGraphChanges
        })
      );

      const testNode = {
        id: "newNode",
        type: "topology-node" as const,
        position: { x: 0, y: 0 },
        data: { label: "newNode", role: "pe" }
      };
      act(() => {
        result.current.pushAction({
          type: "graph",
          before: [{ entity: "node", kind: "add", after: testNode }],
          after: [{ entity: "node", kind: "delete", before: testNode }]
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(applyGraphChanges.calledOnce).to.be.true;
    });

    it("Graph actions call applyGraphChanges on redo", () => {
      const applyGraphChanges = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyGraphChanges
        })
      );

      const testNode = {
        id: "newNode",
        type: "topology-node" as const,
        position: { x: 0, y: 0 },
        data: { label: "newNode", role: "pe" }
      };
      act(() => {
        result.current.pushAction({
          type: "graph",
          before: [{ entity: "node", kind: "add", after: testNode }],
          after: [{ entity: "node", kind: "delete", before: testNode }]
        });
      });
      act(() => {
        result.current.undo();
      });

      applyGraphChanges.resetHistory();

      act(() => {
        result.current.redo();
      });

      expect(applyGraphChanges.calledOnce).to.be.true;
    });
  });

  // ==========================================================================
  // Property Edit Action Tests
  // ==========================================================================
  describe("Property Edit Actions", () => {
    it("Property edit calls applyPropertyEdit on undo", () => {
      const applyPropertyEdit = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyPropertyEdit
        })
      );

      act(() => {
        result.current.pushAction({
          type: "property-edit",
          entityType: "node",
          entityId: "node1",
          before: { name: "OldName", kind: "linux" },
          after: { name: "NewName", kind: "linux" }
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(applyPropertyEdit.calledOnce).to.be.true;
      expect(applyPropertyEdit.firstCall.args[1]).to.be.true; // isUndo = true
    });

    it("Property edit calls applyPropertyEdit on redo", () => {
      const applyPropertyEdit = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyPropertyEdit
        })
      );

      act(() => {
        result.current.pushAction({
          type: "property-edit",
          entityType: "node",
          entityId: "node1",
          before: { name: "OldName", kind: "linux" },
          after: { name: "NewName", kind: "linux" }
        });
      });
      act(() => {
        result.current.undo();
      });

      applyPropertyEdit.resetHistory();

      act(() => {
        result.current.redo();
      });

      expect(applyPropertyEdit.calledOnce).to.be.true;
      expect(applyPropertyEdit.firstCall.args[1]).to.be.false; // isUndo = false
    });
  });

  // ==========================================================================
  // Annotation Action Tests
  // ==========================================================================
  describe("Annotation Actions", () => {
    it("Annotation action calls applyAnnotationChange on undo", () => {
      const applyAnnotationChange = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyAnnotationChange
        })
      );

      act(() => {
        result.current.pushAction({
          type: "annotation",
          annotationType: "freeShape",
          before: null,
          after: { id: "shape1", shapeType: "rectangle" }
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(applyAnnotationChange.calledOnce).to.be.true;
      expect(applyAnnotationChange.firstCall.args[1]).to.be.true; // isUndo = true
    });

    it("Annotation action calls applyAnnotationChange on redo", () => {
      const applyAnnotationChange = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyAnnotationChange
        })
      );

      act(() => {
        result.current.pushAction({
          type: "annotation",
          annotationType: "freeShape",
          before: null,
          after: { id: "shape1", shapeType: "rectangle" }
        });
      });
      act(() => {
        result.current.undo();
      });

      applyAnnotationChange.resetHistory();

      act(() => {
        result.current.redo();
      });

      expect(applyAnnotationChange.calledOnce).to.be.true;
      expect(applyAnnotationChange.firstCall.args[1]).to.be.false; // isUndo = false
    });
  });

  // ==========================================================================
  // Group Move Action Tests
  // ==========================================================================
  describe("Group Move Actions", () => {
    it("Group move calls applyGroupMoveChange on undo", () => {
      const applyGroupMoveChange = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyGroupMoveChange
        })
      );

      act(() => {
        result.current.pushAction({
          type: GROUP_MOVE_TYPE,
          groupBefore: { id: "group1", position: { x: 100, y: 100 } },
          groupAfter: { id: "group1", position: { x: 200, y: 200 } },
          nodesBefore: [{ id: "node1", position: { x: 100, y: 100 } }],
          nodesAfter: [{ id: "node1", position: { x: 200, y: 200 } }]
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(applyGroupMoveChange.calledOnce).to.be.true;
      expect(applyGroupMoveChange.firstCall.args[1]).to.be.true; // isUndo = true
    });

    it("Group move restores node positions on undo", () => {
      const applyGroupMoveChange = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyGroupMoveChange
        })
      );

      act(() => {
        result.current.pushAction({
          type: GROUP_MOVE_TYPE,
          groupBefore: { id: "group1", position: { x: 100, y: 100 } },
          groupAfter: { id: "group1", position: { x: 200, y: 200 } },
          nodesBefore: [{ id: "node1", position: { x: 100, y: 100 } }],
          nodesAfter: [{ id: "node1", position: { x: 200, y: 200 } }]
        });
      });

      act(() => {
        result.current.undo();
      });

      // Verify applyGroupMoveChange was called with correct undo data
      expect(applyGroupMoveChange.calledOnce).to.be.true;
      const action = applyGroupMoveChange.firstCall.args[0];
      expect(action.nodesBefore[0].position.x).to.equal(100);
      expect(action.nodesBefore[0].position.y).to.equal(100);
    });

    it("Group move calls saveNodePositions on undo", () => {
      const applyGroupMoveChange = sinon.stub();

      const { result } = renderHook(() =>
        useUndoRedo({
          enabled: true,
          applyGroupMoveChange
        })
      );

      act(() => {
        result.current.pushAction({
          type: GROUP_MOVE_TYPE,
          groupBefore: { id: "group1", position: { x: 100, y: 100 } },
          groupAfter: { id: "group1", position: { x: 200, y: 200 } },
          nodesBefore: [{ id: "node1", position: { x: 100, y: 100 } }],
          nodesAfter: [{ id: "node1", position: { x: 200, y: 200 } }]
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undo();
      });

      const calls = getServiceCallsByMethod("saveNodePositions");
      expect(calls.length).to.be.greaterThan(0);
    });
  });
});
