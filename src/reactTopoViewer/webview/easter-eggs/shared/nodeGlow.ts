/**
 * Node glow hook for React Flow easter egg modes
 *
 * Updates the canvas store's easterEggGlow state at a throttled rate
 * so node components can read and apply CSS box-shadow effects.
 */

import { useCallback, useEffect, useRef } from "react";

import { useCanvasStore } from "../../stores/canvasStore";

import type { RGBColor } from "./types";

/** Throttle interval for glow updates (~30fps) */
const GLOW_UPDATE_INTERVAL = 33; // ms

/**
 * Hook to update the canvas store's easter egg glow state.
 *
 * This hook manages glow state updates at ~30fps, throttled to avoid
 * excessive React re-renders while still providing smooth visual effects.
 *
 * @param isActive - Whether the easter egg mode is active
 * @param getColor - Function that returns the current glow color
 * @param getIntensity - Function that returns the current intensity (0-1)
 */
export function useNodeGlow(
  isActive: boolean,
  getColor: () => RGBColor,
  getIntensity: () => number
): void {
  const setEasterEggGlow = useCanvasStore((state) => state.setEasterEggGlow);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastColorRef = useRef<RGBColor | null>(null);
  const lastIntensityRef = useRef<number>(-1);

  const updateGlow = useCallback(() => {
    const color = getColor();
    const intensity = getIntensity();

    // Only update if values changed (to minimize store updates)
    const colorChanged =
      !lastColorRef.current ||
      lastColorRef.current.r !== color.r ||
      lastColorRef.current.g !== color.g ||
      lastColorRef.current.b !== color.b;
    const intensityChanged = Math.abs(lastIntensityRef.current - intensity) > 0.01;

    if (colorChanged || intensityChanged) {
      lastColorRef.current = color;
      lastIntensityRef.current = intensity;
      setEasterEggGlow({ color, intensity });
    }
  }, [getColor, getIntensity, setEasterEggGlow]);

  useEffect(() => {
    if (!isActive) {
      // Clear glow when deactivated
      setEasterEggGlow(null);
      lastColorRef.current = null;
      lastIntensityRef.current = -1;
      return undefined;
    }

    // Start interval for glow updates
    intervalRef.current = setInterval(updateGlow, GLOW_UPDATE_INTERVAL);

    // Initial update
    updateGlow();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear glow on cleanup
      setEasterEggGlow(null);
      lastColorRef.current = null;
      lastIntensityRef.current = -1;
    };
  }, [isActive, updateGlow, setEasterEggGlow]);
}
