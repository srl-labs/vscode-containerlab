/**
 * Hook to manage icon selector form state
 */
import { useState, useEffect } from 'react';

const DEFAULT_COLOR = '#1a73e8';

export interface UseIconSelectorStateReturn {
  icon: string;
  setIcon: (icon: string) => void;
  color: string;
  setColor: (color: string) => void;
  radius: number;
  setRadius: (radius: number) => void;
  useColor: boolean;
  setUseColor: (useColor: boolean) => void;
  displayColor: string;
  resultColor: string | null;
}

/**
 * Hook to manage icon selector form state
 */
export function useIconSelectorState(
  isOpen: boolean,
  initialIcon: string,
  initialColor: string | null,
  initialCornerRadius: number
): UseIconSelectorStateReturn {
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor || DEFAULT_COLOR);
  const [radius, setRadius] = useState(initialCornerRadius);
  const [useColor, setUseColor] = useState(!!initialColor);

  useEffect(() => {
    if (isOpen) {
      setIcon(initialIcon);
      setColor(initialColor || DEFAULT_COLOR);
      setRadius(initialCornerRadius);
      setUseColor(!!initialColor);
    }
  }, [isOpen, initialIcon, initialColor, initialCornerRadius]);

  const displayColor = useColor ? color : DEFAULT_COLOR;
  const resultColor = useColor && color !== DEFAULT_COLOR ? color : null;

  return { icon, setIcon, color, setColor, radius, setRadius, useColor, setUseColor, displayColor, resultColor };
}
