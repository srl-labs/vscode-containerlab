/**
 * Cytoscape Compatibility Instance Hook
 *
 * Provides a Cytoscape-compatible interface backed by ReactFlow.
 * This is a migration bridge - the interface mimics Cytoscape's Core API
 * so existing hooks and annotation layers can work without modification.
 *
 * Once migration is complete, this should be removed and all code
 * should use ReactFlow directly.
 */
import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import type { ReactFlowInstance, Node, Edge, Viewport } from "@xyflow/react";

import type { ReactFlowCanvasRef } from "../components/react-flow-canvas/types";

/**
 * Cytoscape-compatible Core interface
 * This mimics the parts of Cytoscape's Core API that we use
 */
export interface CyCompatCore {
  // Viewport methods
  pan(): { x: number; y: number };
  zoom(): number;

  // Container
  container(): HTMLElement | null;

  // Element access
  getElementById(id: string): CyCompatElement;
  nodes(selector?: string): CyCompatCollection;
  edges(selector?: string): CyCompatCollection;
  elements(selector?: string): CyCompatCollection;

  // Event handling (stubs - ReactFlow handles events differently)
  on(events: string, selector: string | (() => void), handler?: () => void): void;
  off(events: string, selector: string | (() => void), handler?: () => void): void;
  one(events: string, handler: () => void): void;

  // Scratch storage (internal state)
  scratch(key: string, value?: unknown): unknown;

  // Viewport control
  fit(eles?: unknown, padding?: number): void;
  center(eles?: unknown): void;

  // State queries
  autoungrabify(val?: boolean): boolean;
  boxSelectionEnabled(val?: boolean): boolean;

  // Batch operations (no-op stubs)
  batch(fn: () => void): void;

  // Layout
  layout(options: { name: string }): { run(): void };

  // Extent (bounding box)
  extent(): { x1: number; y1: number; x2: number; y2: number; w: number; h: number };

  // Add/remove elements (stubs - use React state instead)
  add(eleOrEles: unknown): CyCompatCollection;
  remove(eles: unknown): CyCompatCollection;

  // Empty collection factory
  collection(): CyCompatCollection;
}

/**
 * Cytoscape-compatible element interface
 */
export interface CyCompatElement {
  id(): string;
  data(key?: string, value?: unknown): unknown;
  /** Get or set position. When called with no argument, returns current position. */
  position(newPos?: { x: number; y: number }): { x: number; y: number };
  isNode(): boolean;
  isEdge(): boolean;
  empty(): boolean;
  nonempty(): boolean;
  // Use unknown for same() to allow compatibility with Cytoscape's CollectionArgument
  same(other: unknown): boolean;
  addClass(className: string): void;
  lock(): void;
  unlock(): void;
  length: number;
}

/**
 * Cytoscape-compatible node element interface
 */
export interface CyCompatNodeElement extends CyCompatElement {
  isNode(): true;
  isEdge(): false;
  isParent(): boolean;
}

/**
 * Cytoscape-compatible edge element interface
 */
export interface CyCompatEdgeElement extends CyCompatElement {
  isNode(): false;
  isEdge(): true;
}

/**
 * Cytoscape-compatible collection interface
 */
export interface CyCompatCollection extends CyCompatElement {
  forEach(fn: (ele: CyCompatElement) => void): void;
  filter(fn: (ele: CyCompatElement) => boolean): CyCompatCollection;
  map<T>(fn: (ele: CyCompatElement) => T): T[];
  some(fn: (ele: CyCompatElement) => boolean): boolean;
  toArray(): CyCompatElement[];
  first(): CyCompatElement;
  unselect(): CyCompatCollection;
  lock(): void;
  unlock(): void;
}

/**
 * Cytoscape-compatible event object interface
 */
export interface CyCompatEventObject {
  target: CyCompatCore | CyCompatElement;
  originalEvent?: MouseEvent | TouchEvent;
  position?: { x: number; y: number };
}

/**
 * Create a Cytoscape-compatible element wrapper
 */
function createCyCompatElement(node?: Node | Edge): CyCompatElement {
  if (!node) {
    return {
      id: () => "",
      data: () => undefined,
      position: (_newPos?: { x: number; y: number }) => ({ x: 0, y: 0 }),
      isNode: () => false,
      isEdge: () => false,
      empty: () => true,
      nonempty: () => false,
      same: () => false,
      addClass: () => {
        /* no-op */
      },
      lock: () => {
        /* no-op */
      },
      unlock: () => {
        /* no-op */
      },
      length: 0
    };
  }

  const isNode = !("source" in node);
  const elementId = node.id;

  return {
    id: () => elementId,
    data: (key?: string, value?: unknown) => {
      if (key === undefined) return node.data;
      if (value !== undefined) {
        (node.data as Record<string, unknown>)[key] = value;
        return value;
      }
      return (node.data as Record<string, unknown>)?.[key];
    },
    position: (newPos?: { x: number; y: number }) => {
      if (isNode) {
        const n = node as Node;
        if (newPos !== undefined) {
          // Note: Setting position directly on the element is a no-op in ReactFlow.
          // Position updates should be handled via React state (setNodes).
          // This setter is kept for API compatibility.
          n.position = newPos;
        }
        return n.position ?? { x: 0, y: 0 };
      }
      return { x: 0, y: 0 };
    },
    isNode: () => isNode,
    isEdge: () => !isNode,
    empty: () => false,
    nonempty: () => true,
    same: (other: CyCompatElement) => other.id() === elementId,
    addClass: (_className: string) => {
      /* Handled via ReactFlow classes */
    },
    lock: () => {
      /* Handled via ReactFlow draggable prop */
    },
    unlock: () => {
      /* Handled via ReactFlow draggable prop */
    },
    length: 1
  };
}

/**
 * Create a Cytoscape-compatible collection wrapper
 */
function createCyCompatCollection(elements: Array<Node | Edge>): CyCompatCollection {
  const wrapped = elements.map(createCyCompatElement);

  const collection: CyCompatCollection = {
    id: () => wrapped[0]?.id() ?? "",
    data: (key?: string, value?: unknown) => wrapped[0]?.data(key, value),
    position: () => wrapped[0]?.position() ?? { x: 0, y: 0 },
    isNode: () => wrapped[0]?.isNode() ?? false,
    isEdge: () => wrapped[0]?.isEdge() ?? false,
    empty: () => wrapped.length === 0,
    nonempty: () => wrapped.length > 0,
    same: (other: CyCompatElement) => wrapped[0]?.same(other) ?? false,
    addClass: (className: string) => wrapped.forEach((el) => el.addClass(className)),
    lock: () => wrapped.forEach((el) => el.lock()),
    unlock: () => wrapped.forEach((el) => el.unlock()),
    length: wrapped.length,
    forEach: (fn) => wrapped.forEach(fn),
    filter: (fn) => createCyCompatCollection(elements.filter((_, i) => fn(wrapped[i]))),
    map: (fn) => wrapped.map(fn),
    some: (fn) => wrapped.some(fn),
    toArray: () => wrapped,
    first: () => wrapped[0] ?? createCyCompatElement(),
    unselect: () => collection // No-op for now
  };

  return collection;
}

/**
 * Internal state for the compatibility layer
 */
interface CyCompatState {
  scratchData: Record<string, unknown>;
  autoungrabify: boolean;
  boxSelectionEnabled: boolean;
  eventHandlers: Map<string, Set<() => void>>;
}

/**
 * Create a Cytoscape-compatible Core interface backed by ReactFlow
 */
export function createCyCompatCore(
  rfInstance: ReactFlowInstance | null,
  getNodes: () => Node[],
  getEdges: () => Edge[],
  state: CyCompatState
): CyCompatCore {
  const getViewport = (): Viewport => {
    if (!rfInstance) return { x: 0, y: 0, zoom: 1 };
    return rfInstance.getViewport();
  };

  const getElementById = (id: string): CyCompatElement => {
    const nodes = getNodes();
    const edges = getEdges();
    const node = nodes.find((n) => n.id === id);
    if (node) return createCyCompatElement(node);
    const edge = edges.find((e) => e.id === id);
    if (edge) return createCyCompatElement(edge);
    return createCyCompatElement();
  };

  return {
    pan: () => {
      const v = getViewport();
      return { x: v.x, y: v.y };
    },

    zoom: () => getViewport().zoom,

    container: () => document.querySelector(".react-flow") as HTMLElement | null,

    getElementById,

    nodes: (_selector?: string) => {
      const nodes = getNodes();
      // Selector filtering can be added if needed
      return createCyCompatCollection(nodes);
    },

    edges: (_selector?: string) => {
      const edges = getEdges();
      return createCyCompatCollection(edges);
    },

    elements: (_selector?: string) => {
      const nodes = getNodes();
      const edges = getEdges();
      return createCyCompatCollection([...nodes, ...edges]);
    },

    on: (events: string, selector: string | (() => void), handler?: () => void) => {
      // Event handling stub - ReactFlow uses different event system
      const eventList = events.split(" ");
      const callback = typeof selector === "function" ? selector : handler;
      if (callback) {
        eventList.forEach((event) => {
          if (!state.eventHandlers.has(event)) {
            state.eventHandlers.set(event, new Set());
          }
          state.eventHandlers.get(event)!.add(callback);
        });
      }
    },

    off: (events: string, selector: string | (() => void), handler?: () => void) => {
      const eventList = events.split(" ");
      const callback = typeof selector === "function" ? selector : handler;
      if (callback) {
        eventList.forEach((event) => {
          state.eventHandlers.get(event)?.delete(callback);
        });
      }
    },

    one: (_events: string, handler: () => void) => {
      // One-time event - execute immediately since we're not using Cytoscape events
      handler();
    },

    scratch: (key: string, value?: unknown) => {
      if (value !== undefined) {
        state.scratchData[key] = value;
      }
      return state.scratchData[key];
    },

    fit: (_eles?: unknown, padding?: number) => {
      rfInstance?.fitView({ padding: (padding ?? 50) / 1000 });
    },

    center: (_eles?: unknown) => {
      rfInstance?.fitView({ padding: 0.1 });
    },

    autoungrabify: (val?: boolean) => {
      if (val !== undefined) {
        state.autoungrabify = val;
      }
      return state.autoungrabify;
    },

    boxSelectionEnabled: (val?: boolean) => {
      if (val !== undefined) {
        state.boxSelectionEnabled = val;
      }
      return state.boxSelectionEnabled;
    },

    batch: (fn: () => void) => {
      // Just execute - ReactFlow batches updates automatically
      fn();
    },

    layout: (_options: { name: string }) => ({
      run: () => {
        // Layout is handled by ReactFlowCanvas ref methods
      }
    }),

    extent: () => {
      const nodes = getNodes();
      if (nodes.length === 0) {
        return { x1: 0, y1: 0, x2: 100, y2: 100, w: 100, h: 100 };
      }

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      nodes.forEach((node) => {
        const x = node.position?.x ?? 0;
        const y = node.position?.y ?? 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 50); // Assume 50px width
        maxY = Math.max(maxY, y + 50); // Assume 50px height
      });

      return {
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
        w: maxX - minX,
        h: maxY - minY
      };
    },

    add: (_eleOrEles: unknown) => createCyCompatCollection([]),
    remove: (_eles: unknown) => createCyCompatCollection([]),

    collection: () => createCyCompatCollection([])
  };
}

/**
 * Hook that provides a Cytoscape-compatible interface backed by ReactFlow
 */
export function useCyCompatInstance(
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>,
  rfInstance: ReactFlowInstance | null
): {
  cyCompat: CyCompatCore | null;
  isReady: boolean;
} {
  const [isReady, setIsReady] = useState(false);

  const stateRef = useRef<CyCompatState>({
    scratchData: {},
    autoungrabify: false,
    boxSelectionEnabled: true,
    eventHandlers: new Map()
  });

  const getNodes = useCallback(() => {
    return reactFlowRef.current?.getNodes() ?? [];
  }, [reactFlowRef]);

  const getEdges = useCallback(() => {
    return reactFlowRef.current?.getEdges() ?? [];
  }, [reactFlowRef]);

  const cyCompat = useMemo(() => {
    if (!rfInstance) return null;
    return createCyCompatCore(rfInstance, getNodes, getEdges, stateRef.current);
  }, [rfInstance, getNodes, getEdges]);

  useEffect(() => {
    if (rfInstance && !isReady) {
      setIsReady(true);
    }
  }, [rfInstance, isReady]);

  return { cyCompat, isReady };
}

// Note: All types (CyCompatCore, CyCompatElement, CyCompatNodeElement, CyCompatEdgeElement,
// CyCompatCollection, CyCompatEventObject) are exported via their interface declarations above.
