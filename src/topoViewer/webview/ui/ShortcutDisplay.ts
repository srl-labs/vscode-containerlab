import { log } from '../platform/logging/logger';

/**
 * Manager for displaying keyboard and mouse shortcuts.
 * Handles toggling, event listening, and displaying input events.
 */
export class ManagerShortcutDisplay {
  private shortcutEnabled: boolean = false;
  private displayContainer: HTMLElement | null = null;
  private toggleButton: HTMLElement | null = null;
  private isMac: boolean = /macintosh/i.test(window.navigator.userAgent);
  private friendlyKeys: Record<string, string> = {
    Control: 'Ctrl',
    Shift: 'Shift',
    Alt: 'Alt',
    Meta: 'Meta',
    ' ': 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    Enter: 'Enter',
    Escape: 'Esc',
    CapsLock: 'Caps Lock',
  };

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.displayContainer = document.getElementById('shortcut-display');
    this.toggleButton = document.getElementById('toggle-shortcut-display');
    if (!this.displayContainer || !this.toggleButton) {
      log.warn('Shortcut display elements not found');
      return;
    }
    this.toggleButton.addEventListener('click', this.toggleShortcutDisplay.bind(this));
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    document.addEventListener('mousedown', this.handleMousedown.bind(this));
  }

  private toggleShortcutDisplay() {
    this.shortcutEnabled = !this.shortcutEnabled;
    this.toggleButton!.classList.toggle('bg-[var(--vscode-button-hoverBackground)]', this.shortcutEnabled);
    const eyeIcon = document.getElementById('eye-icon');
    if (eyeIcon) {
      eyeIcon.classList.toggle('fa-eye', this.shortcutEnabled);
      eyeIcon.classList.toggle('fa-eye-slash', !this.shortcutEnabled);
    }
    if (!this.shortcutEnabled) {
      this.displayContainer!.innerHTML = '';
    }
  }

  /**
   * Adds a new display item for the detected input shortcut.
   * @param text The shortcut text to display.
   */
  private addInputDisplay(text: string) {
    if (this.displayContainer!.children.length >= 8) {
      const oldest = this.displayContainer!.firstChild;
      oldest?.remove();
    }
    const div = document.createElement('div');
    div.textContent = text;
    div.className = 'px-4 py-1.5 rounded-lg shadow-md opacity-0 transition-all duration-200 ease-in-out font-sans text-sm tracking-wide';
    div.style.backgroundColor = 'var(--vscode-editor-background)';
    div.style.color = 'var(--vscode-foreground)';
    div.style.border = '1px solid color-mix(in srgb, var(--vscode-foreground) 20%, transparent)';
    div.style.opacity = '0.95';
    this.displayContainer!.appendChild(div);
    setTimeout(() => {
      div.classList.add('opacity-100', 'scale-100');
      div.classList.remove('scale-95');
    }, 10);
    setTimeout(() => {
      div.classList.remove('opacity-100', 'scale-100');
      div.classList.add('opacity-0', 'scale-95');
      setTimeout(() => { div.remove(); }, 200);
    }, 2000);
  }

  private handleKeydown(e: KeyboardEvent) {
    if (!this.shortcutEnabled || e.repeat) return;
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'TEXTAREA'].includes(tag)) return;
    const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta'];
    if (modifierKeys.includes(e.key)) return; // Skip lone modifiers
    const modifiers = this.getModifiers(e);
    const key = this.friendlyKeys[e.key] || e.key.toUpperCase();
    const shortcut = [...modifiers, key].join(' + ');
    if (shortcut) this.addInputDisplay(shortcut);
  }

  private handleMousedown(e: MouseEvent) {
    if (!this.shortcutEnabled) return;
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'BUTTON', 'SELECT'].includes(tag)) return;
    const modifiers = this.getModifiers(e);
    const click = ['Left Click', 'Middle Click', 'Right Click'][e.button];
    if (!click) return;
    const shortcut = [...modifiers, click].join(' + ');
    this.addInputDisplay(shortcut);
  }

  private getModifiers(e: KeyboardEvent | MouseEvent): string[] {
    return (
      [
        [e.ctrlKey, this.isMac ? '⌃' : 'Ctrl'],
        [e.shiftKey, this.isMac ? '⇧' : 'Shift'],
        [e.altKey, this.isMac ? '⌥' : 'Alt'],
        [e.metaKey, this.isMac ? '⌘' : 'Meta'],
      ] as [boolean, string][]
    )
      .filter(([pressed]) => pressed)
      .map(([, display]) => display);
  }
}
