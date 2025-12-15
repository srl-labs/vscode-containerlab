/**
 * Easter Egg Hook - Logo Click Party Mode
 *
 * Click the Containerlab logo 10 times to trigger party mode!
 * A fun hidden feature for users who discover it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';

/** Number of clicks required to trigger party mode */
const CLICKS_REQUIRED = 10;

/** Timeout for resetting click count if user stops clicking (ms) */
const CLICK_TIMEOUT = 2000;

export interface EasterEggState {
  /** Whether party mode is currently active */
  isPartyMode: boolean;
  /** Progress through clicks (0-10) */
  progress: number;
  /** Time remaining in party mode (ms) */
  timeRemaining: number;
}

export interface UseEasterEggOptions {
  /** Cytoscape instance for node effects */
  cyInstance: CyCore | null;
  /** Callback when party mode activates */
  onActivate?: () => void;
  /** Callback when party mode ends */
  onDeactivate?: () => void;
}

export interface UseEasterEggReturn {
  /** Current easter egg state */
  state: EasterEggState;
  /** Handle logo click - call this when logo is clicked */
  handleLogoClick: () => void;
  /** Manually trigger party mode (for testing) */
  triggerPartyMode: () => void;
  /** End party mode early */
  endPartyMode: () => void;
}

/**
 * Hook for detecting logo clicks and managing party mode state
 */
export function useEasterEgg(options: UseEasterEggOptions): UseEasterEggReturn {
  const { cyInstance, onActivate, onDeactivate } = options;

  const [isPartyMode, setIsPartyMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationIntervalRef = useRef<number | null>(null);
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const partyNodesRef = useRef<NodeSingular[]>([]);
  const hueRotationRef = useRef(0);

  /**
   * Apply rainbow colors to nodes in batch
   */
  const applyRainbowBatch = useCallback((isInitial: boolean) => {
    if (!cyInstance) return;
    const nodes = partyNodesRef.current;
    const hueRotation = hueRotationRef.current;

    cyInstance.batch(() => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const hue = (hueRotation + i * 30) % 360;
        node.style({
          'border-width': '3px',
          'border-color': `hsl(${hue}, 100%, 60%)`,
          'background-color': `hsl(${(hue + 180) % 360}, 80%, 40%)`
        });
        if (isInitial) {
          node.addClass('party-node');
        }
      }
    });
  }, [cyInstance]);

  /**
   * Animation frame callback for rainbow effect
   */
  const animateRainbow = useCallback(() => {
    hueRotationRef.current = (hueRotationRef.current + 5) % 360;
    applyRainbowBatch(false);
  }, [applyRainbowBatch]);

  /**
   * Apply rainbow effect to cytoscape nodes
   */
  const applyNodeEffects = useCallback(() => {
    if (!cyInstance) return;

    const nodes = cyInstance.nodes();
    partyNodesRef.current = nodes.toArray();
    hueRotationRef.current = 0;

    // Store original styles
    nodes.forEach(node => {
      const id = node.id();
      originalStylesRef.current.set(id, {
        'background-color': node.style('background-color'),
        'border-color': node.style('border-color'),
        'border-width': node.style('border-width')
      });
    });

    // Apply party class to container
    const container = cyInstance.container();
    container?.classList.add('party-mode-active');

    // Apply initial colors
    applyRainbowBatch(true);

    // Start animation interval
    animationIntervalRef.current = window.setInterval(animateRainbow, 50);
  }, [cyInstance, applyRainbowBatch, animateRainbow]);

  /**
   * Remove effects and restore original styles
   */
  const removeNodeEffects = useCallback(() => {
    if (!cyInstance) return;

    // Clear animation interval
    if (animationIntervalRef.current) {
      window.clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }

    // Remove party class from container
    const container = cyInstance.container();
    container?.classList.remove('party-mode-active');

    // Restore original styles
    cyInstance.batch(() => {
      cyInstance.nodes().forEach(node => {
        const id = node.id();
        const originalStyles = originalStylesRef.current.get(id);
        if (originalStyles) {
          node.style(originalStyles);
        }
        node.removeClass('party-node');
      });
    });

    originalStylesRef.current.clear();
  }, [cyInstance]);

  /**
   * End party mode
   */
  const endPartyMode = useCallback(() => {
    setIsPartyMode(false);
    setTimeRemaining(0);

    // Clear timeouts and intervals
    if (partyTimeoutRef.current) {
      clearTimeout(partyTimeoutRef.current);
      partyTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Remove effects
    removeNodeEffects();

    // Call deactivation callback
    onDeactivate?.();
  }, [removeNodeEffects, onDeactivate]);

  /**
   * Trigger party mode!
   */
  const triggerPartyMode = useCallback(() => {
    if (isPartyMode) return;

    setIsPartyMode(true);
    setTimeRemaining(0); // No timer - runs until cancelled
    setProgress(0);
    clickCountRef.current = 0;

    // Apply effects
    applyNodeEffects();

    // Call activation callback
    onActivate?.();

    // No auto-end - party runs until manually cancelled
  }, [isPartyMode, applyNodeEffects, onActivate]);

  /**
   * Handle logo click
   */
  const handleLogoClick = useCallback(() => {
    // Don't count clicks during party mode
    if (isPartyMode) return;

    // Clear previous timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // Increment click count
    clickCountRef.current += 1;
    setProgress(clickCountRef.current);

    // Check if we've reached the required clicks
    if (clickCountRef.current >= CLICKS_REQUIRED) {
      triggerPartyMode();
      return;
    }

    // Set timeout to reset click count
    clickTimeoutRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      setProgress(0);
    }, CLICK_TIMEOUT);
  }, [isPartyMode, triggerPartyMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      if (partyTimeoutRef.current) {
        clearTimeout(partyTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (animationIntervalRef.current) {
        window.clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  return {
    state: {
      isPartyMode,
      progress,
      timeRemaining
    },
    handleLogoClick,
    triggerPartyMode,
    endPartyMode
  };
}
