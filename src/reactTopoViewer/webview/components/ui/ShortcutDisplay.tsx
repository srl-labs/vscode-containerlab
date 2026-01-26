/**
 * ShortcutDisplay - Visual feedback for keyboard/mouse shortcuts
 * Displays detected input events as floating labels
 */
import React from "react";

interface ShortcutDisplayItem {
  id: number;
  text: string;
}

interface ShortcutDisplayProps {
  shortcuts: ShortcutDisplayItem[];
}

export const ShortcutDisplay: React.FC<ShortcutDisplayProps> = ({ shortcuts }) => {
  if (shortcuts.length === 0) return null;

  return (
    <div className="shortcut-display fixed bottom-4 left-4 flex flex-col-reverse items-start gap-1 z-[100000] pointer-events-none">
      {shortcuts.map((shortcut) => (
        <div
          key={shortcut.id}
          className="shortcut-display-item px-4 py-1.5 rounded-lg shadow-md font-sans text-sm tracking-wide animate-shortcut-fade"
        >
          {shortcut.text}
        </div>
      ))}
    </div>
  );
};
