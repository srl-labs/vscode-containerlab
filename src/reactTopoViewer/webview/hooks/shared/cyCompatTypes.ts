/**
 * Types for Cytoscape compatibility layer
 * NOTE: These types are kept for the migration period to allow existing code
 * to compile. The actual CyCompat implementation has been removed.
 * All code using these types is effectively disabled during ReactFlow migration.
 */

// ============================================================================
// CyLike interfaces - minimal Cytoscape-like types
// ============================================================================

/**
 * Minimal element interface that works with both Cytoscape and the compatibility layer.
 */
export interface CyLikeElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data(key?: string): any;
  position(): { x: number; y: number };
  isNode(): boolean;
  isEdge(): boolean;
  empty(): boolean;
  nonempty(): boolean;
  id(): string;
  length: number;
}

/**
 * Minimal collection interface that works with both Cytoscape and the compatibility layer.
 */
export interface CyLikeCollection {
  length: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forEach(fn: (ele: any) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter(fn: (ele: any) => boolean): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map<T>(fn: (ele: any) => T): T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  first(): any;
  empty(): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  some(fn: (ele: any) => boolean): boolean;
}

/**
 * Minimal cytoscape-like interface that both Core and CyCompat satisfy.
 * This allows hooks to work with either the real Cytoscape or the compatibility layer.
 */
export interface CyLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getElementById(id: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edges(selector?: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes(selector?: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection(): any;
  pan(): { x: number; y: number };
  zoom(): number;
  container(): HTMLElement | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(events: string, selector: any, handler?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(events: string, selector: any, handler?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  one(events: string, handler: any): void;
  scratch(key: string, value?: unknown): unknown;
  fit(eles?: unknown, padding?: number): void;
  autoungrabify(val?: boolean): boolean;
  autounselectify(val?: boolean): boolean;
  userPanningEnabled(val?: boolean): boolean;
  boxSelectionEnabled(val?: boolean): boolean;
  extent(): { x1: number; y1: number; x2: number; y2: number; w?: number; h?: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batch(fn: () => void): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resize(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout(options: unknown): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements(selector?: string): any;
}

// ============================================================================
// CyCompat stub interfaces
// ============================================================================

export interface CyCompatNodeLike {
  id(): string;
  data(key?: string): unknown;
  position(): { x: number; y: number };
  position(pos: { x: number; y: number }): void;
  grabbed?(): boolean;
  locked?(): boolean;
  unlock?(): void;
  lock?(): void;
  length?: number;
}

export interface CyCompatEdgeLike {
  id(): string;
  data(key?: string): unknown;
}

export interface CyCompatCollectionLike<T> {
  forEach(fn: (item: T) => void): void;
  filter(fn: (item: T) => boolean): CyCompatCollectionLike<T>;
  map<U>(fn: (item: T) => U): U[];
  length?: number;
}

export interface CyCompatCoreLike {
  nodes(selector?: string): CyCompatCollectionLike<CyCompatNodeLike>;
  edges(): CyCompatCollectionLike<CyCompatEdgeLike>;
  elements(): CyCompatCollectionLike<CyCompatNodeLike | CyCompatEdgeLike>;
  getElementById(id: string): CyCompatNodeLike;
  container(): HTMLElement | null;
  scratch(key: string, value?: unknown): unknown;
  extent(): { x1: number; y1: number; x2: number; y2: number };
  on(event: string, handler: () => void): void;
  on(event: string, selector: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
  off(event: string, selector: string, handler: () => void): void;
  fit(padding?: number): void;
  zoom(): number;
  pan(): { x: number; y: number };
}

export interface CyCompatEventLike {
  target: CyCompatNodeLike | CyCompatEdgeLike;
  position?: { x: number; y: number };
  originalEvent?: MouseEvent;
}

/**
 * Type for cyCompat parameter during migration
 * This prevents TypeScript from narrowing to 'never' after null checks
 * The actual value is always null during migration
 */
export type CyCompatParam = CyCompatCoreLike | null;
