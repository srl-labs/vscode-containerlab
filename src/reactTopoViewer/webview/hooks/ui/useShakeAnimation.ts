/**
 * useShakeAnimation - Simple shake animation state hook
 */
import { useCallback, useState } from "react";

export function useShakeAnimation() {
  const [isShaking, setIsShaking] = useState(false);
  const trigger = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  }, []);
  return { isShaking, trigger };
}
