/**
 * Easter Egg Hook - Logo Click Easter Egg Modes
 *
 * Click the Containerlab logo 10 times to trigger one of four easter eggs:
 * - Nightcall: 80s synthwave vibe (Kavinsky inspired)
 * - Stickerbrush Symphony: Dreamy forest ambient (DKC2 inspired)
 * - Aquatic Ambience: Underwater serenity (DKC inspired)
 * - Vaporwave: Slowed down smooth jazz aesthetic
 *
 * 25/25/25/25 random chance between the four modes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Number of clicks required to trigger easter egg */
const CLICKS_REQUIRED = 10;

/** Timeout for resetting click count if user stops clicking (ms) */
const CLICK_TIMEOUT = 2000;

/** Available easter egg modes */
export type EasterEggMode = 'nightcall' | 'stickerbrush' | 'aquatic' | 'vaporwave';

export interface EasterEggState {
  /** Whether easter egg mode is currently active */
  isPartyMode: boolean;
  /** Which easter egg mode is active */
  easterEggMode: EasterEggMode;
  /** Progress through clicks (0-10) */
  progress: number;
  /** Time remaining (unused, kept for compatibility) */
  timeRemaining: number;
}

export interface UseEasterEggOptions {
  /** Cytoscape instance (passed to Nightcall component) */
  cyInstance: unknown;
  /** Callback when easter egg activates */
  onActivate?: () => void;
  /** Callback when easter egg ends */
  onDeactivate?: () => void;
}

export interface UseEasterEggReturn {
  /** Current easter egg state */
  state: EasterEggState;
  /** Handle logo click - call this when logo is clicked */
  handleLogoClick: () => void;
  /** Manually trigger easter egg (for testing) */
  triggerPartyMode: () => void;
  /** End easter egg early */
  endPartyMode: () => void;
}

/**
 * Hook for detecting logo clicks and managing easter egg state
 */
export function useEasterEgg(options: UseEasterEggOptions): UseEasterEggReturn {
  const { onActivate, onDeactivate } = options;

  const [isPartyMode, setIsPartyMode] = useState(false);
  const [easterEggMode, setEasterEggMode] = useState<EasterEggMode>('nightcall');
  const [progress, setProgress] = useState(0);

  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * End easter egg mode
   */
  const endPartyMode = useCallback(() => {
    setIsPartyMode(false);
    onDeactivate?.();
  }, [onDeactivate]);

  /**
   * Trigger easter egg mode with random mode selection
   */
  const triggerPartyMode = useCallback(() => {
    if (isPartyMode) return;

    // 25/25/25/25 random selection between modes (visual effect only, not security-sensitive)
    // eslint-disable-next-line sonarjs/pseudo-random
    const rand = Math.random();
    let mode: EasterEggMode;
    if (rand < 0.25) {
      mode = 'nightcall';
    } else if (rand < 0.5) {
      mode = 'stickerbrush';
    } else if (rand < 0.75) {
      mode = 'aquatic';
    } else {
      mode = 'vaporwave';
    }
    setEasterEggMode(mode);

    setIsPartyMode(true);
    setProgress(0);
    clickCountRef.current = 0;

    onActivate?.();
  }, [isPartyMode, onActivate]);

  /**
   * Handle logo click
   */
  const handleLogoClick = useCallback(() => {
    if (isPartyMode) return;

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickCountRef.current += 1;
    setProgress(clickCountRef.current);

    if (clickCountRef.current >= CLICKS_REQUIRED) {
      triggerPartyMode();
      return;
    }

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
    };
  }, []);

  return {
    state: {
      isPartyMode,
      easterEggMode,
      progress,
      timeRemaining: 0
    },
    handleLogoClick,
    triggerPartyMode,
    endPartyMode
  };
}
