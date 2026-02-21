/**
 * useShortcutDisplay - Hook for displaying keyboard and mouse shortcuts
 * Migrated from legacy TopoViewer ShortcutDisplayManager.ts
 */
import { useState, useEffect, useCallback, useRef } from "react";

interface ShortcutDisplayItem {
  id: number;
  text: string;
}

interface UseShortcutDisplayResult {
  /** Whether shortcut display is enabled */
  isEnabled: boolean;
  /** Toggle shortcut display on/off */
  toggle: () => void;
  /** Currently displayed shortcuts */
  shortcuts: ShortcutDisplayItem[];
}

/** Platform detection for keyboard symbols */
const isMac =
  typeof window !== "undefined" &&
  typeof window.navigator !== "undefined" &&
  /macintosh/i.test(window.navigator.userAgent);

/** Maximum number of shortcuts to display at once */
const MAX_SHORTCUTS = 8;

/** Duration to show each shortcut (ms) */
const DISPLAY_DURATION = 2000;

/** Friendly key mappings */
const FRIENDLY_KEYS: Record<string, string> = {
  Control: "Ctrl",
  Shift: "Shift",
  Alt: "Alt",
  Meta: "Meta",
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "Page Up",
  PageDown: "Page Down",
  Enter: "Enter",
  Escape: "Esc",
  CapsLock: "Caps Lock",
};

/** Modifier keys to ignore when pressed alone */
const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta"];

/** Tags to ignore for keyboard events */
const KEYBOARD_IGNORE_TAGS = ["INPUT", "TEXTAREA"];

/** Tags to ignore for mouse events */
const MOUSE_IGNORE_TAGS = ["INPUT", "BUTTON", "SELECT"];

/** Get modifier keys from event */
function getModifiers(e: KeyboardEvent | MouseEvent): string[] {
  const modifiers: [boolean, string][] = [
    [e.ctrlKey, isMac ? "⌃" : "Ctrl"],
    [e.shiftKey, isMac ? "⇧" : "Shift"],
    [e.altKey, isMac ? "⌥" : "Alt"],
    [e.metaKey, isMac ? "⌘" : "Meta"],
  ];
  return modifiers.filter(([pressed]) => pressed).map(([, display]) => display);
}

/** Convert mouse button to friendly name */
function getMouseButtonName(button: number): string | null {
  const names = ["Left Click", "Middle Click", "Right Click"];
  return names[button] ?? null;
}

/** Check if event target is an ignored tag */
function isIgnoredTag(target: EventTarget | null, ignoredTags: string[]): boolean {
  if (!target) return false;
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return ignoredTags.includes(tag);
}

/** Format keyboard shortcut string */
function formatKeyboardShortcut(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.includes(e.key)) return null;
  const modifiers = getModifiers(e);
  const key = FRIENDLY_KEYS[e.key] ?? e.key.toUpperCase();
  return [...modifiers, key].join(" + ");
}

/** Format mouse shortcut string */
function formatMouseShortcut(e: MouseEvent): string | null {
  const modifiers = getModifiers(e);
  const click = getMouseButtonName(e.button);
  if (click === null) return null;
  return [...modifiers, click].join(" + ");
}

/** Filter out a shortcut by id */
function filterShortcut(id: number): (prev: ShortcutDisplayItem[]) => ShortcutDisplayItem[] {
  return (prev) => prev.filter((s) => s.id !== id);
}

/** Append shortcut and limit to max */
function appendShortcut(
  id: number,
  text: string
): (prev: ShortcutDisplayItem[]) => ShortcutDisplayItem[] {
  return (prev) => [...prev, { id, text }].slice(-MAX_SHORTCUTS);
}

/**
 * Hook for displaying keyboard and mouse shortcuts
 */
export function useShortcutDisplay(): UseShortcutDisplayResult {
  const [isEnabled, setIsEnabled] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutDisplayItem[]>([]);
  const nextIdRef = useRef(0);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => {
      if (prev) setShortcuts([]);
      return !prev;
    });
  }, []);

  const addShortcut = useCallback((text: string) => {
    const id = nextIdRef.current++;
    setShortcuts(appendShortcut(id, text));
    setTimeout(() => setShortcuts(filterShortcut(id)), DISPLAY_DURATION);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.repeat || isIgnoredTag(e.target, KEYBOARD_IGNORE_TAGS)) return;
      const shortcut = formatKeyboardShortcut(e);
      if (shortcut !== null && shortcut.length > 0) addShortcut(shortcut);
    }

    function handleMousedown(e: MouseEvent) {
      if (isIgnoredTag(e.target, MOUSE_IGNORE_TAGS)) return;
      const shortcut = formatMouseShortcut(e);
      if (shortcut !== null && shortcut.length > 0) addShortcut(shortcut);
    }

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("mousedown", handleMousedown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("mousedown", handleMousedown);
    };
  }, [isEnabled, addShortcut]);

  return { isEnabled, toggle, shortcuts };
}
