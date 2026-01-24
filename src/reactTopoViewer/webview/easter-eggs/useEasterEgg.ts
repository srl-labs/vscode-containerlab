/**
 * Easter Egg Hook - Logo Click Easter Egg Modes
 *
 * Click the Containerlab logo 10 times to trigger one of five easter eggs:
 * - Nightcall: 80s synthwave vibe (Kavinsky inspired)
 * - Stickerbrush Symphony: Dreamy forest ambient (DKC2 inspired)
 * - Aquatic Ambience: Underwater serenity (DKC inspired)
 * - Vaporwave: Slowed down smooth jazz aesthetic
 * - Deus Ex: 3D rotating logo with metallic theme (silent mode)
 *
 * 20/20/20/20/20 random chance between the five modes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Number of clicks required to trigger easter egg */
const CLICKS_REQUIRED = 10;

/** Timeout for resetting click count if user stops clicking (ms) */
const CLICK_TIMEOUT = 2000;

/** Available easter egg modes */
export type EasterEggMode = "nightcall" | "stickerbrush" | "aquatic" | "vaporwave" | "deusex";

export interface EasterEggState {
  /** Whether easter egg mode is currently active */
  isPartyMode: boolean;
  /** Which easter egg mode is active */
  easterEggMode: EasterEggMode;
  /** Progress through clicks (0-10) */
  progress: number;
}

export interface UseEasterEggOptions {
  /** Cytoscape compatibility instance (passed to easter egg components) */
  cyCompat: unknown;
  /** Callback when easter egg activates */
  onActivate?: () => void;
  /** Callback when easter egg ends */
  onDeactivate?: () => void;
}

/** All available modes in order */
const ALL_MODES: EasterEggMode[] = ["nightcall", "stickerbrush", "aquatic", "vaporwave", "deusex"];

export interface UseEasterEggReturn {
  /** Current easter egg state */
  state: EasterEggState;
  /** Handle logo click - call this when logo is clicked */
  handleLogoClick: () => void;
  /** Manually trigger easter egg (for testing) */
  triggerPartyMode: () => void;
  /** End easter egg early */
  endPartyMode: () => void;
  /** Switch to the next easter egg mode */
  nextMode: () => void;
  /** Get display name for current mode */
  getModeName: () => string;
}

/**
 * Hook for detecting logo clicks and managing easter egg state
 */
export function useEasterEgg(options: UseEasterEggOptions): UseEasterEggReturn {
  const { onActivate, onDeactivate } = options;

  const [isPartyMode, setIsPartyMode] = useState(false);
  const [easterEggMode, setEasterEggMode] = useState<EasterEggMode>("nightcall");
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
   * Switch to the next easter egg mode
   */
  const nextMode = useCallback(() => {
    if (!isPartyMode) return;

    const currentIndex = ALL_MODES.indexOf(easterEggMode);
    const nextIndex = (currentIndex + 1) % ALL_MODES.length;
    setEasterEggMode(ALL_MODES[nextIndex]);
  }, [isPartyMode, easterEggMode]);

  /**
   * Get display name for the current mode
   */
  const getModeName = useCallback((): string => {
    const names: Record<EasterEggMode, string> = {
      nightcall: "Nightcall",
      stickerbrush: "Stickerbrush",
      aquatic: "Aquatic",
      vaporwave: "Vaporwave",
      deusex: "Deus Ex"
    };
    return names[easterEggMode];
  }, [easterEggMode]);

  /**
   * Trigger easter egg mode with random mode selection
   */
  const triggerPartyMode = useCallback(() => {
    if (isPartyMode) return;

    // 20/20/20/20/20 random selection between modes (visual effect only, not security-sensitive)
    // eslint-disable-next-line sonarjs/pseudo-random
    const rand = Math.random();
    let mode: EasterEggMode;
    if (rand < 0.2) {
      mode = "nightcall";
    } else if (rand < 0.4) {
      mode = "stickerbrush";
    } else if (rand < 0.6) {
      mode = "aquatic";
    } else if (rand < 0.8) {
      mode = "vaporwave";
    } else {
      mode = "deusex";
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
      progress
    },
    handleLogoClick,
    triggerPartyMode,
    endPartyMode,
    nextMode,
    getModeName
  };
}
