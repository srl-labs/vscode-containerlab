/**
 * Hook for handling ESC key to close modals/panels
 */
import { useEffect } from 'react';

/**
 * Hook that calls onClose when ESC key is pressed while isOpen is true
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
}
