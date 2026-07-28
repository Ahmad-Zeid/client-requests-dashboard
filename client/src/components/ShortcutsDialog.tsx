import { useEffect, useRef } from 'react';

import { MOD_KEY } from '../hooks/useKeyboardShortcuts';
import { Icon } from './Icon';
import { KbdGroup } from './Kbd';

type Group = { label: string; rows: Array<{ keys: string[]; action: string }> };

const GROUPS: Group[] = [
  {
    label: 'General',
    rows: [
      { keys: [MOD_KEY, 'K'], action: 'Command palette' },
      { keys: ['/'], action: 'Search requests' },
      { keys: ['C'], action: 'New request' },
      { keys: ['?'], action: 'This sheet' },
      { keys: ['Esc'], action: 'Close, or clear selection' },
    ],
  },
  {
    label: 'Queue',
    rows: [
      { keys: ['J'], action: 'Next request' },
      { keys: ['K'], action: 'Previous request' },
      { keys: ['↵'], action: 'Open the selected request' },
      { keys: ['E'], action: 'Advance the selected request' },
      { keys: ['1'], action: 'All' },
      { keys: ['2'], action: 'New' },
      { keys: ['3'], action: 'In progress' },
      { keys: ['4'], action: 'Done' },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="dialog__head">
        <div>
          <h2 className="dialog__title" id="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <p className="dialog__hint">Everything here is reachable without a mouse.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="dialog__body">
        <div className="shortcuts">
          {GROUPS.map((group) => (
            <section key={group.label}>
              <p className="shortcuts__group-label">{group.label}</p>
              {group.rows.map((row) => (
                <div className="shortcuts__row" key={row.action}>
                  <span>{row.action}</span>
                  <KbdGroup keys={row.keys} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
