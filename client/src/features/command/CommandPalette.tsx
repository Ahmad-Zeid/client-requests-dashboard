import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../../components/Icon';
import { Kbd } from '../../components/Kbd';
import { filterCommands, groupCommands, type Command } from './commands';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  commands: Command[];
};

/**
 * ⌘K, following the Linear / Raycast pattern.
 *
 * Two details separate a palette that feels right from one that feels bolted on:
 *
 *   1. It opens instantly. No scale-in, no fade. A palette is a tool you reach for
 *      mid-thought; 200ms of animation is 200ms of waiting.
 *   2. The *highlight* moves between rows — the rows themselves never move. An
 *      animated list is disorienting when you're arrowing through it quickly.
 *
 * The input keeps focus the entire time, so typing continues to filter no matter
 * how far down the list you have arrowed.
 */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(null);

  const visible = useMemo(() => filterCommands(commands, query), [commands, query]);
  const grouped = useMemo(() => groupCommands(visible), [visible]);
  const active = visible[activeIndex];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setQuery('');
      setActiveIndex(0);
      setHighlight(null);
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Filtering changes the list, so the previous index may no longer exist.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  /**
   * Measure the active row and move the highlight to it. useLayoutEffect so the
   * measurement happens before paint — with useEffect the highlight visibly lags
   * a frame behind the arrow key.
   */
  useLayoutEffect(() => {
    if (!open || !active) {
      setHighlight(null);
      return;
    }

    const element = itemRefs.current.get(active.id);
    const list = listRef.current;
    if (!element || !list) return;

    setHighlight({ top: element.offsetTop, height: element.offsetHeight });
    element.scrollIntoView({ block: 'nearest' });
  }, [open, active, visible]);

  function move(delta: number) {
    if (visible.length === 0) return;
    // Wraps at both ends — arrowing up from the first item lands on the last.
    setActiveIndex((current) => (current + delta + visible.length) % visible.length);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      /**
       * Handled here rather than left to the dialog's native `cancel` event.
       * This component is controlled, so closing has to go through `onClose` — if
       * the browser closes the element on its own, React state still believes the
       * palette is open and the next render tries to re-open it.
       */
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(visible.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (active) {
          onClose();
          active.run();
        }
        break;
      default:
        break;
    }
  }

  // Running an action always closes first, so the palette never lingers over the
  // change it just caused.
  function select(command: Command) {
    onClose();
    command.run();
  }

  let flatIndex = -1;

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Command palette"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // Click outside the panel dismisses. The dialog element itself fills the
        // viewport, so a click landing on it and not on a child is a backdrop click.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="palette__search">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          value={query}
          placeholder="Search commands and requests…"
          aria-label="Search commands"
          aria-controls="palette-list"
          aria-activedescendant={active ? `palette-item-${active.id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="palette__list" id="palette-list" role="listbox" ref={listRef}>
        {highlight ? (
          <div
            className="palette__highlight"
            style={{ translate: `0 ${highlight.top}px`, height: highlight.height }}
            aria-hidden="true"
          />
        ) : null}

        {visible.length === 0 ? (
          <p className="palette__empty">No matches for “{query}”.</p>
        ) : (
          grouped.map(([group, items]) => (
            <div key={group}>
              <p className="palette__group-label">{group}</p>
              {items.map((command) => {
                flatIndex += 1;
                const index = flatIndex;

                return (
                  <button
                    key={command.id}
                    id={`palette-item-${command.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex}
                    className="palette__item"
                    ref={(element) => {
                      if (element) itemRefs.current.set(command.id, element);
                      else itemRefs.current.delete(command.id);
                    }}
                    // Pointer movement moves the selection, so mouse and keyboard
                    // never disagree about what Enter would do.
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => select(command)}
                  >
                    <Icon name={command.icon} size={15} className="palette__item-icon" />
                    <span className="palette__item-label">{command.label}</span>
                    {command.hint ? <span className="palette__item-meta">{command.hint}</span> : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="palette__foot">
        <span className="palette__foot-item">
          <Icon name="arrowUpDown" size={12} /> navigate
        </span>
        <span className="palette__foot-item">
          <Icon name="cornerDownLeft" size={12} /> select
        </span>
        <span className="palette__foot-item">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </dialog>
  );
}
