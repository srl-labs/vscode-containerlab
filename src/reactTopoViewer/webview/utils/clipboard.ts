/**
 * Clipboard utilities for copying text
 */

/**
 * Copy text to clipboard with fallback for older browsers.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (typeof window !== 'undefined' && window.navigator?.clipboard) {
    try {
      await window.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback using selection (for older browsers or restricted contexts)
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy'); // eslint-disable-line sonarjs/deprecation
      return true;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return false;
}
