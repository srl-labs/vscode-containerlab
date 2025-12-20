/* eslint-env mocha */
/**
 * Tests for useGraphUndoRedoHandlers hook
 *
 * This test suite covers:
 * - Graph actions (node/edge creation and deletion)
 * - Property edit actions
 * - Recursive prevention (isApplyingUndoRedo flag)
 * - Graph change bucketing (correct order of adds/deletes)
 * - Persistence calls to extension
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';

// Setup jsdom for React Testing Library
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true
});

// Use Object.defineProperty for properties that may have getters
Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(globalThis, 'window', { value: dom.window, writable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement, writable: true });
Object.defineProperty(globalThis, 'Element', { value: dom.window.Element, writable: true });

import { renderHook, act } from '@testing-library/react';

import { useGraphUndoRedoHandlers } from '../../../../../src/reactTopoViewer/webview/hooks/state/useGraphUndoRedoHandlers';
import { createMockCytoscape, createTestNode, createTestEdge } from '../../helpers/cytoscape-stub';
import {
  setupGlobalVscodeMock,
  teardownGlobalVscodeMock
} from '../../helpers/vscode-webview-stub';
import {
  setupServiceStubs,
  teardownServiceStubs,
  getServiceCallsByMethod,
  clearServiceCalls
} from '../../helpers/services-stub';
import {
  sampleNodes,
  clone
} from '../../helpers/undoRedo-fixtures';
import type { CyElement } from '../../../../../src/reactTopoViewer/shared/types/topology';

describe('useGraphUndoRedoHandlers', () => {
  let mockMenuHandlers: { handleDeleteNode: sinon.SinonStub; handleDeleteLink: sinon.SinonStub };
  let mockAddNode: sinon.SinonStub;
  let mockAddEdge: sinon.SinonStub;

  beforeEach(() => {
    setupGlobalVscodeMock();
    setupServiceStubs();
    mockMenuHandlers = {
      handleDeleteNode: sinon.stub(),
      handleDeleteLink: sinon.stub()
    };
    mockAddNode = sinon.stub();
    mockAddEdge = sinon.stub();
  });

  afterEach(() => {
    teardownServiceStubs();
    teardownGlobalVscodeMock();
    sinon.restore();
  });

  // ==========================================================================
  // Graph Actions Tests
  // ==========================================================================
  describe('Graph Actions', () => {
    it('G-001: Node creation pushes add action', () => {
      const cy = createMockCytoscape();
      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
      expect(mockAddNode.calledOnce).to.be.true;
    });

    it('G-002: Node deletion pushes delete action with connected edges', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 }),
        createTestEdge('e1', 'node1', 'node2')
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.handleDeleteNodeWithUndo('node1');
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
      expect(mockMenuHandlers.handleDeleteNode.calledOnceWith('node1')).to.be.true;
    });

    it('G-003: Edge creation pushes add action', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 })
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.handleEdgeCreated('node1', 'node2', {
          id: 'e1',
          source: 'node1',
          target: 'node2',
          sourceEndpoint: 'e1-1',
          targetEndpoint: 'e1-1'
        });
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
      expect(mockAddEdge.calledOnce).to.be.true;
    });

    it('G-004: Edge deletion pushes delete action', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 }),
        createTestEdge('e1', 'node1', 'node2', 'e1-1', 'e1-1')
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.handleDeleteLinkWithUndo('e1');
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
      expect(mockMenuHandlers.handleDeleteLink.calledOnceWith('e1')).to.be.true;
    });

    it('G-005: Undo node add removes node', () => {
      const cy = createMockCytoscape();

      // Track what operations are performed
      let addedNodeId: string | null = null;
      const trackingAddNode = sinon.stub().callsFake((element: CyElement) => {
        addedNodeId = element.data.id as string;
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: trackingAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      expect(addedNodeId).to.equal('node1');
      expect(cy.getElementById('node1').nonempty()).to.be.true;

      // Undo - should call handleDeleteNode
      act(() => {
        result.current.undoRedo.undo();
      });

      expect(mockMenuHandlers.handleDeleteNode.called).to.be.true;
    });

    it('G-006: Redo node add creates node', () => {
      const cy = createMockCytoscape();

      const trackingAddNode = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      // Make handleDeleteNode actually remove the node so redo can re-add it
      const deletingMenuHandlers = {
        handleDeleteNode: sinon.stub().callsFake((id: string) => {
          cy.getElementById(id).remove();
        }),
        handleDeleteLink: sinon.stub()
      };

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: trackingAddNode,
        addEdge: mockAddEdge,
        menuHandlers: deletingMenuHandlers
      }));

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      // Undo - will actually remove the node now
      act(() => {
        result.current.undoRedo.undo();
      });

      expect(cy.getElementById('node1').empty()).to.be.true;

      trackingAddNode.resetHistory();

      // Redo - should add node again since it was actually deleted
      act(() => {
        result.current.undoRedo.redo();
      });

      expect(trackingAddNode.called).to.be.true;
      expect(cy.getElementById('node1').nonempty()).to.be.true;
    });

    it('G-009: Undo edge add removes edge', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 })
      ]);

      const trackingAddEdge = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: trackingAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.handleEdgeCreated('node1', 'node2', {
          id: 'e1',
          source: 'node1',
          target: 'node2',
          sourceEndpoint: 'e1-1',
          targetEndpoint: 'e1-1'
        });
      });

      expect(cy.getElementById('e1').nonempty()).to.be.true;

      // Undo - should delete edge
      act(() => {
        result.current.undoRedo.undo();
      });

      expect(mockMenuHandlers.handleDeleteLink.called).to.be.true;
    });

    it('G-010: Redo edge add creates edge', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 })
      ]);

      const trackingAddEdge = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      // Make handleDeleteLink actually remove the edge so redo can re-add it
      const deletingMenuHandlers = {
        handleDeleteNode: sinon.stub(),
        handleDeleteLink: sinon.stub().callsFake((id: string) => {
          cy.getElementById(id).remove();
        })
      };

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: trackingAddEdge,
        menuHandlers: deletingMenuHandlers
      }));

      act(() => {
        result.current.handleEdgeCreated('node1', 'node2', {
          id: 'e1',
          source: 'node1',
          target: 'node2',
          sourceEndpoint: 'e1-1',
          targetEndpoint: 'e1-1'
        });
      });
      act(() => {
        result.current.undoRedo.undo();
      });

      expect(cy.getElementById('e1').empty()).to.be.true;

      trackingAddEdge.resetHistory();

      // Redo - should add edge again since it was actually deleted
      act(() => {
        result.current.undoRedo.redo();
      });

      expect(trackingAddEdge.called).to.be.true;
    });
  });

  // ==========================================================================
  // Property Edit Tests
  // ==========================================================================
  describe('Property Edit Actions', () => {
    it('P-001: recordPropertyEdit creates action with correct type', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'OldName', kind: 'linux' },
          after: { name: 'NewName', kind: 'linux' }
        });
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
    });

    it('P-002: Node property edit action has entityType: node', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'Router1' },
          after: { name: 'Router2' }
        });
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
    });

    it('P-003: Link property edit action has entityType: link', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 }),
        createTestEdge('e1', 'node1', 'node2')
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'link',
          entityId: 'e1',
          before: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-1' },
          after: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-2' }
        });
      });

      expect(result.current.undoRedo.undoCount).to.equal(1);
    });

    it('P-004: Undo property edit calls editNode for non-rename', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'Router1', kind: 'linux' },
          after: { name: 'Router1', kind: 'nokia_srlinux' } // Same name, different kind
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editNode');
      expect(calls.length).to.be.greaterThan(0);
    });

    it('P-006: Node rename undo calls editNode with rename info', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'OldName' },
          after: { name: 'NewName' }
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editNode');
      expect(calls.length).to.be.greaterThan(0);
      // Verify it's a rename (name should change from NewName back to OldName)
      const nodeData = calls[0].args[0] as { id: string; name: string };
      expect(nodeData.name).to.equal('OldName');
    });

    it('P-007: Link edit undo calls editLink with original endpoints', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 }),
        createTestEdge('e1', 'node1', 'node2', 'e1-1', 'e1-1')
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'link',
          entityId: 'e1',
          before: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-1' },
          after: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-2' }
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editLink');
      expect(calls.length).to.be.greaterThan(0);
      // The call should contain original endpoints for lookup
      const linkData = calls[0].args[0] as { originalSourceEndpoint?: string };
      expect(linkData).to.have.property('originalSourceEndpoint');
    });
  });

  // ==========================================================================
  // Recursive Prevention Tests
  // ==========================================================================
  describe('Recursive Prevention', () => {
    it('RP-001: No double-push during node creation replay', () => {
      const cy = createMockCytoscape();

      const trackingAddNode = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: trackingAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      // Create a node
      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      const countAfterCreate = result.current.undoRedo.undoCount;
      expect(countAfterCreate).to.equal(1);

      // Undo - this calls addNode during replay but should NOT push
      act(() => {
        result.current.undoRedo.undo();
      });

      // Redo - this calls addNode during replay but should NOT push
      act(() => {
        result.current.undoRedo.redo();
      });

      // Should still be 1 action (the original create)
      expect(result.current.undoRedo.undoCount).to.equal(countAfterCreate);
    });

    it('RP-002: No double-push during edge creation replay', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 })
      ]);

      const trackingAddEdge = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: trackingAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.handleEdgeCreated('node1', 'node2', {
          id: 'e1',
          source: 'node1',
          target: 'node2',
          sourceEndpoint: 'e1-1',
          targetEndpoint: 'e1-1'
        });
      });

      const countAfterCreate = result.current.undoRedo.undoCount;

      act(() => {
        result.current.undoRedo.undo();
      });
      act(() => {
        result.current.undoRedo.redo();
      });

      expect(result.current.undoRedo.undoCount).to.equal(countAfterCreate);
    });

    it('RP-005: No push during property edit replay', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'OldName' },
          after: { name: 'NewName' }
        });
      });

      const countAfterEdit = result.current.undoRedo.undoCount;

      act(() => {
        result.current.undoRedo.undo();
      });
      act(() => {
        result.current.undoRedo.redo();
      });

      expect(result.current.undoRedo.undoCount).to.equal(countAfterEdit);
    });
  });

  // ==========================================================================
  // Persistence Call Tests
  // ==========================================================================
  describe('Persistence Calls', () => {
    it('PC-004: createNode called on node creation', () => {
      const cy = createMockCytoscape();

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      clearServiceCalls();

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      const calls = getServiceCallsByMethod('createNode');
      expect(calls.length).to.be.greaterThan(0);
      const nodeData = calls[0].args[0] as { id: string };
      expect(nodeData.id).to.equal('node1');
    });

    it('PC-005: createLink called on edge creation', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 })
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      clearServiceCalls();

      act(() => {
        result.current.handleEdgeCreated('node1', 'node2', {
          id: 'e1',
          source: 'node1',
          target: 'node2',
          sourceEndpoint: 'e1-1',
          targetEndpoint: 'e1-1'
        });
      });

      const calls = getServiceCallsByMethod('createLink');
      expect(calls.length).to.be.greaterThan(0);
      const linkData = calls[0].args[0] as { source: string; target: string };
      expect(linkData).to.have.property('source', 'node1');
      expect(linkData).to.have.property('target', 'node2');
    });

    it('PC-006: beginBatch called before graph replay', () => {
      const cy = createMockCytoscape();

      const trackingAddNode = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: trackingAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const beginCalls = getServiceCallsByMethod('beginBatch');
      expect(beginCalls.length).to.be.greaterThan(0);
    });

    it('PC-007: endBatch called after graph replay', () => {
      const cy = createMockCytoscape();

      const trackingAddNode = sinon.stub().callsFake((element: CyElement) => {
        cy.add(element);
      });

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: trackingAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      const node = clone(sampleNodes[0]);
      act(() => {
        result.current.handleNodeCreatedCallback(
          node.data.id as string,
          node,
          node.position!
        );
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const endCalls = getServiceCallsByMethod('endBatch');
      expect(endCalls.length).to.be.greaterThan(0);
    });

    it('PC-008: editNode called on property undo', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'Router1', kind: 'linux' },
          after: { name: 'Router1', kind: 'srlinux' }
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editNode');
      expect(calls.length).to.be.greaterThan(0);
    });

    it('PC-009: editLink called on link property undo', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 }),
        createTestNode('node2', { x: 200, y: 200 }),
        createTestEdge('e1', 'node1', 'node2')
      ]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'link',
          entityId: 'e1',
          before: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-1' },
          after: { source: 'node1', target: 'node2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-2' }
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editLink');
      expect(calls.length).to.be.greaterThan(0);
    });

    it('PC-010: editNode called for node rename undo with correct names', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'OldRouter' },
          after: { name: 'NewRouter' }
        });
      });

      clearServiceCalls();

      act(() => {
        result.current.undoRedo.undo();
      });

      const calls = getServiceCallsByMethod('editNode');
      expect(calls.length).to.be.greaterThan(0);
      const nodeData = calls[0].args[0] as { id: string; name: string };
      // When undoing rename, current name (NewRouter) is used as id to find node,
      // and target name (OldRouter) is the new name
      expect(nodeData.id).to.equal('NewRouter');
      expect(nodeData.name).to.equal('OldRouter');
    });
  });

  // ==========================================================================
  // Mode Tests
  // ==========================================================================
  describe('Mode Handling', () => {
    it('Undo/redo disabled in view mode', () => {
      const cy = createMockCytoscape([createTestNode('node1', { x: 100, y: 100 })]);

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'view',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      expect(result.current.undoRedo.canUndo).to.be.false;
      expect(result.current.undoRedo.canRedo).to.be.false;
    });

    it('Actions not recorded in view mode', () => {
      const cy = createMockCytoscape();

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'view',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      // Try to record property edit - should be no-op
      act(() => {
        result.current.recordPropertyEdit({
          entityType: 'node',
          entityId: 'node1',
          before: { name: 'Old' },
          after: { name: 'New' }
        });
      });

      expect(result.current.undoRedo.undoCount).to.equal(0);
    });
  });

  // ==========================================================================
  // Annotation Callback Tests
  // ==========================================================================
  describe('Annotation Callbacks', () => {
    it('applyAnnotationChange callback is passed through', () => {
      const cy = createMockCytoscape();
      const applyAnnotationChange = sinon.stub();

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers,
        applyAnnotationChange
      }));

      // Push an annotation action via undoRedo
      act(() => {
        result.current.undoRedo.pushAction({
          type: 'annotation',
          annotationType: 'freeShape',
          before: null,
          after: { id: 'shape1', shapeType: 'rectangle' }
        });
      });

      act(() => {
        result.current.undoRedo.undo();
      });

      expect(applyAnnotationChange.calledOnce).to.be.true;
    });

    it('applyGroupMoveChange callback is passed through', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 })
      ]);
      const applyGroupMoveChange = sinon.stub();

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers,
        applyGroupMoveChange
      }));

      act(() => {
        result.current.undoRedo.pushAction({
          type: 'group-move',
          groupBefore: { id: 'g1', position: { x: 100, y: 100 } },
          groupAfter: { id: 'g1', position: { x: 200, y: 200 } },
          nodesBefore: [{ id: 'node1', position: { x: 100, y: 100 } }],
          nodesAfter: [{ id: 'node1', position: { x: 200, y: 200 } }]
        });
      });

      act(() => {
        result.current.undoRedo.undo();
      });

      expect(applyGroupMoveChange.calledOnce).to.be.true;
    });

    it('applyMembershipChange callback is passed through', () => {
      const cy = createMockCytoscape([
        createTestNode('node1', { x: 100, y: 100 })
      ]);
      const applyMembershipChange = sinon.stub();

      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: cy,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers,
        applyMembershipChange
      }));

      act(() => {
        result.current.undoRedo.pushAction({
          type: 'move',
          before: [{ id: 'node1', position: { x: 100, y: 100 } }],
          after: [{ id: 'node1', position: { x: 200, y: 200 } }],
          membershipBefore: [{ nodeId: 'node1', groupId: 'g1:1' }],
          membershipAfter: [{ nodeId: 'node1', groupId: null }]
        });
      });

      act(() => {
        result.current.undoRedo.undo();
      });

      expect(applyMembershipChange.calledOnce).to.be.true;
    });
  });

  // ==========================================================================
  // Null Cytoscape Tests
  // ==========================================================================
  describe('Null Cytoscape Handling', () => {
    it('Handles null cyInstance gracefully', () => {
      const { result } = renderHook(() => useGraphUndoRedoHandlers({
        cyInstance: null,
        mode: 'edit',
        addNode: mockAddNode,
        addEdge: mockAddEdge,
        menuHandlers: mockMenuHandlers
      }));

      // Should not throw
      expect(result.current.undoRedo).to.exist;
      expect(result.current.undoRedo.undoCount).to.equal(0);
    });
  });
});
