import { useEffect, useRef } from 'react';

export type Shortcut = {
  /** Lower-case `event.key`, e.g. 'k', '/', 'arrowdown', 'escape'. */
  key: string;
  /** Requires ⌘ on macOS or Ctrl elsewhere. */
  meta?: boolean;
  shift?: boolean;
  /**
   * Fire even while the user is typing. Only Escape and ⌘-combinations should
   * ever set this — everything else has to yield to the text field.
   */
  allowWhileTyping?: boolean;
  run: (event: KeyboardEvent) => void;
};

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * True when the keystroke belongs to whatever the user is typing into.
 *
 * This is the make-or-break detail of a single-key shortcut system: without it,
 * typing "check" into the search box fires C (new request), E (advance) and K
 * (move selection) on the way. Every real keyboard-driven app has this guard, and
 * every broken one is missing it.
 */
function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true): void {
  // Held in a ref so the listener is attached once and never re-bound as the
  // handlers change identity between renders.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;
      const typing = isTypingContext(event.target);

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.key !== key) continue;
        if (Boolean(shortcut.meta) !== meta) continue;
        if (shortcut.shift !== undefined && shortcut.shift !== event.shiftKey) continue;
        if (typing && !shortcut.allowWhileTyping) continue;

        event.preventDefault();
        shortcut.run(event);
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** ⌘ on Apple platforms, Ctrl everywhere else. Read once — it cannot change. */
export const MOD_KEY = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
  ? '⌘'
  : 'Ctrl';
