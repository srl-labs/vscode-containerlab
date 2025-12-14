/**
 * Hook for delayed Cytoscape initialization
 * Waits for container to have non-zero dimensions before initializing
 */
import React, { useEffect } from 'react';
import type { CyElement } from '../../../shared/types/messages';

/**
 * Setup delayed initialization with ResizeObserver fallback
 */
function setupDelayedInit(
  container: HTMLDivElement,
  initialElementsRef: React.RefObject<CyElement[] | null>,
  initCytoscape: (initialElements: CyElement[]) => (() => void) | null,
  cleanupRef: React.RefObject<(() => void) | null>
): () => void {
  let initialized = false;
  let resizeObserver: ResizeObserver | null = null;
  let intervalId: number | null = null;

  const tryInit = () => {
    if (initialized) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    initialized = true;
    cleanupRef.current = initCytoscape(initialElementsRef.current ?? []) ?? null;
    resizeObserver?.disconnect();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  tryInit();

  if (!initialized) {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => tryInit());
      resizeObserver.observe(container);
    } else {
      intervalId = window.setInterval(() => tryInit(), 100);
    }
  }

  return () => {
    resizeObserver?.disconnect();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
    cleanupRef.current?.();
    cleanupRef.current = null;
  };
}

/**
 * Hook for delayed Cytoscape initialization
 * Waits for container to have non-zero dimensions before initializing
 */
export function useDelayedCytoscapeInit(
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialElementsRef: React.RefObject<CyElement[] | null>,
  initCytoscape: (initialElements: CyElement[]) => (() => void) | null,
  cleanupRef: React.RefObject<(() => void) | null>
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return setupDelayedInit(container, initialElementsRef, initCytoscape, cleanupRef);
  }, [containerRef, initialElementsRef, initCytoscape, cleanupRef]);
}
