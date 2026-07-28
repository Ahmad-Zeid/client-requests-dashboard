import { useEffect, useRef } from 'react';

import { PriorityMarker, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Kbd } from '../../components/Kbd';
import {
  ADVANCE_LABELS,
  NEXT_STATUS,
  REQUEST_STATUSES,
  STATUS_LABELS,
  type ClientRequest,
} from '../../types/request';

type RequestDrawerProps = {
  request: ClientRequest | null;
  isPending: boolean;
  onClose: () => void;
  onAdvance: (request: ClientRequest) => void;
};

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The full record for one request.
 *
 * This exists because the table truncates descriptions and there was previously no
 * way to read one — a real gap, not a cosmetic one. A native `<dialog>` gives the
 * focus trap, the Escape handler and `inert` on the background for free; a
 * div-based drawer would have to reimplement all three, usually incompletely.
 */
export function RequestDrawer({ request, isPending, onClose, onAdvance }: RequestDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (request && !dialog.open) {
      dialog.showModal();
      /**
       * `showModal()` would otherwise land focus on the close button — a screen
       * reader user's first announcement would be "Close details" rather than the
       * request they just opened. Focusing the panel itself makes the browser
       * announce its `aria-labelledby` title instead.
       */
      dialog.focus();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  if (!request) {
    return <dialog ref={dialogRef} className="drawer" onClose={onClose} onCancel={onClose} />;
  }

  const next = NEXT_STATUS[request.status];
  const advanceLabel = ADVANCE_LABELS[request.status];
  const currentIndex = REQUEST_STATUSES.indexOf(request.status);

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      tabIndex={-1}
      aria-labelledby="drawer-title"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="drawer__head">
        <div>
          <div className="drawer__eyebrow">
            <StatusBadge status={request.status} />
            <PriorityMarker priority={request.priority} />
          </div>
          <h2 className="drawer__title" id="drawer-title">
            {request.title}
          </h2>
        </div>

        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="drawer__body">
        <section className="drawer__section">
          <p className="drawer__section-label">Detail</p>
          <p className="drawer__description">
            {request.description ?? 'No detail was recorded for this request.'}
          </p>
        </section>

        <section className="drawer__section">
          <p className="drawer__section-label">Lifecycle</p>
          <ol className="lifecycle">
            {REQUEST_STATUSES.map((status, index) => {
              const state =
                index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future';

              return (
                <li className="lifecycle__step" key={status} data-state={state}>
                  <span className="lifecycle__marker">
                    <span className="lifecycle__dot" />
                    {index < REQUEST_STATUSES.length - 1 ? (
                      <span className="lifecycle__line" />
                    ) : null}
                  </span>
                  <span className="lifecycle__label">{STATUS_LABELS[status]}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="drawer__section">
          <p className="drawer__section-label">Record</p>
          <dl className="drawer__meta">
            <dt>Client</dt>
            <dd>{request.clientName}</dd>

            <dt>Created</dt>
            <dd className="numeric">{formatAbsolute(request.createdAt)}</dd>

            <dt>Last change</dt>
            <dd className="numeric">{formatAbsolute(request.updatedAt)}</dd>

            <dt>Version</dt>
            {/* Surfaced deliberately: this is the number the conflict check compares,
                so seeing it move makes the concurrency behaviour observable. */}
            <dd className="numeric">v{request.version}</dd>

            <dt>ID</dt>
            <dd className="numeric">{request.id}</dd>
          </dl>
        </section>
      </div>

      <footer className="drawer__foot">
        {next && advanceLabel ? (
          <Button
            variant="primary"
            block
            state={isPending ? 'loading' : 'idle'}
            loadingLabel={advanceLabel}
            leading={<Icon name={request.status === 'new' ? 'arrowRight' : 'tick'} size={15} />}
            onClick={() => onAdvance(request)}
          >
            {advanceLabel}
            <Kbd>E</Kbd>
          </Button>
        ) : (
          <p className="pagination__summary" style={{ textAlign: 'center' }}>
            This request is closed. The server will not move it backwards.
          </p>
        )}
      </footer>
    </dialog>
  );
}
