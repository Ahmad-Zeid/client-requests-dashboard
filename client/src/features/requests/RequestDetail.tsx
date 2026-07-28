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
  type RequestEvent,
} from '../../types/request';
import { useRequestActivity, useRequestsQuery } from './useRequests';

type RequestDetailProps = {
  request: ClientRequest;
  isPending: boolean;
  onAdvance: (request: ClientRequest) => void;
  /** Jump to a sibling request from the same client. */
  onSelect?: (id: string) => void;
  /** Only rendered in the mobile overlay, where the pane is dismissible. */
  onClose?: () => void;
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

/** "4h ago", "3d ago" — the trail is scanned for shape before it is read for detail. */
function formatRelative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

/** What the event did, in the words someone would use out loud. */
function describe(event: RequestEvent): string {
  if (event.type === 'created') return 'logged this request';
  if (event.toStatus === 'in_progress') return 'started work';
  if (event.toStatus === 'done') return 'marked it done';
  return `moved it to ${STATUS_LABELS[event.toStatus]}`;
}

/**
 * The lifecycle as a horizontal track rather than a list.
 *
 * It sits under the title because it is orientation, not content — where this request
 * is in a three-step process is the first thing you need and the last thing you should
 * have to read. Rendered from the same `REQUEST_STATUSES` array the server enforces,
 * so a fourth status would appear here without anyone touching this component.
 */
function Stepper({ current }: { current: ClientRequest['status'] }) {
  const currentIndex = REQUEST_STATUSES.indexOf(current);

  return (
    <ol className="stepper" aria-label="Lifecycle">
      {REQUEST_STATUSES.map((status, index) => (
        <li
          className="stepper__step"
          key={status}
          data-state={index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          <span className="stepper__dot" aria-hidden="true" />
          <span className="stepper__label">{STATUS_LABELS[status]}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The trail, straight from `GET /requests/:id/activity`.
 *
 * This is the part of the record that cannot be reconstructed from the row: the row
 * says a request is done, the trail says who finished it and when, and which version
 * each write produced. It loads after the pane is already on screen — the request
 * itself comes from the list cache, so nothing here blocks the first paint.
 */
function Activity({ requestId }: { requestId: string }) {
  const activity = useRequestActivity(requestId);

  return (
    <section className="detail__section">
      <p className="detail__section-label">Activity</p>

      {activity.isPending ? (
        <ol className="trail" aria-hidden="true">
          {[0, 1].map((index) => (
            <li className="trail__event" key={index}>
              <span className="trail__marker" />
              <span className="trail__body">
                <span className="skeleton" style={{ width: index === 0 ? '58%' : '44%' }} />
              </span>
            </li>
          ))}
        </ol>
      ) : activity.isError ? (
        <p className="trail__empty">The trail could not be loaded.</p>
      ) : activity.data && activity.data.length > 0 ? (
        <ol className="trail">
          {activity.data.map((event) => (
            <li className="trail__event" key={event.id} data-to={event.toStatus}>
              <span className="trail__marker" aria-hidden="true">
                <Icon name={event.type === 'created' ? 'plus' : 'arrowRight'} size={11} />
              </span>

              <span className="trail__body">
                <span className="trail__line">
                  <strong>{event.actor}</strong> {describe(event)}
                </span>
                <span className="trail__meta">
                  <time dateTime={event.createdAt} title={formatAbsolute(event.createdAt)}>
                    {formatRelative(event.createdAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span className="numeric">v{event.version}</span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="trail__empty">Nothing recorded yet.</p>
      )}
    </section>
  );
}

/**
 * The rest of this client's work.
 *
 * The question an account manager actually asks is never about one request — it is
 * "where are we with Sable Athletics". Answering it from the queue means filtering,
 * losing your place, and filtering back. Reuses the list query with a client scope,
 * so it shares a cache with the rail's client filter and is patched by the same live
 * updates; opening one of these costs no request at all.
 */
function SiblingRequests({
  request,
  onSelect,
}: {
  request: ClientRequest;
  onSelect: (id: string) => void;
}) {
  const siblings = useRequestsQuery({
    status: 'all',
    attention: false,
    client: request.clientName,
    q: '',
    page: 1,
    pageSize: 6,
  });

  const others = (siblings.data?.data ?? []).filter((row) => row.id !== request.id);
  if (others.length === 0) return null;

  return (
    <section className="siblings">
      <p className="detail__section-label">Also from this client</p>
      <ul className="siblings__list">
        {others.map((row) => (
          <li key={row.id}>
            <button type="button" className="siblings__item" onClick={() => onSelect(row.id)}>
              <span className="request-item__status" data-status={row.status} aria-hidden="true">
                <span className="status__dot" />
              </span>
              <span className="siblings__title">{row.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The full record for one request.
 *
 * Two columns on a wide pane: what the request *is* on the left, what the system
 * *knows about it* on the right. Splitting them keeps the reading column narrow
 * enough to actually read, and stops the identifiers — which nobody reads and
 * everybody occasionally needs — from interrupting the description.
 *
 * Shared by the persistent pane on wide screens and the overlay drawer on narrow
 * ones; the responsive rules collapse it back to one column.
 */
export function RequestDetail({
  request,
  isPending,
  onAdvance,
  onSelect,
  onClose,
}: RequestDetailProps) {
  const next = NEXT_STATUS[request.status];
  const advanceLabel = ADVANCE_LABELS[request.status];

  return (
    <>
      <header className="detail__head">
        <div className="detail__head-main">
          <div className="detail__eyebrow">
            <StatusBadge status={request.status} />
            <PriorityMarker priority={request.priority} />
            <span className="detail__client">{request.clientName}</span>
          </div>
          <h2 className="detail__title" id="detail-title">
            {request.title}
          </h2>
          <Stepper current={request.status} />
        </div>

        {onClose ? (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </header>

      <div className="detail__body">
        <div className="detail__main">
          {request.attention ? (
            <p className="attention-callout" data-reason={request.attention.reason}>
              <Icon name="alert" size={14} />
              {request.attention.label}
            </p>
          ) : null}

          <section className="detail__section">
            <p className="detail__section-label">Detail</p>
            <p className="detail__description">
              {request.description ?? 'No detail was recorded for this request.'}
            </p>
          </section>

          <Activity requestId={request.id} />
        </div>

        <aside className="detail__aside" aria-label="Record">
          <dl className="detail__meta">
            <dt>Client</dt>
            <dd>{request.clientName}</dd>

            <dt>Priority</dt>
            <dd className="detail__meta-priority">
              <PriorityMarker priority={request.priority} />
            </dd>

            <dt>Created</dt>
            <dd className="numeric">{formatAbsolute(request.createdAt)}</dd>

            <dt>Last change</dt>
            <dd className="numeric">{formatAbsolute(request.updatedAt)}</dd>

            <dt>Version</dt>
            {/* Surfaced deliberately: this is the number the conflict check compares,
                so watching it move makes the concurrency behaviour observable. */}
            <dd className="numeric">
              v{request.version}
              <span className="detail__meta-note">compared on every status change</span>
            </dd>

            <dt>ID</dt>
            <dd className="numeric detail__id">{request.id}</dd>
          </dl>

          {onSelect ? <SiblingRequests request={request} onSelect={onSelect} /> : null}
        </aside>
      </div>

      <footer className="detail__foot">
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
          <p className="detail__closed">
            <Icon name="check" size={14} />
            Closed — the server will not move it backwards.
          </p>
        )}
      </footer>
    </>
  );
}

/** Shown in the detail pane when nothing is selected. */
export function RequestDetailEmpty() {
  return (
    <div className="detail__empty">
      <Icon name="inbox" size={22} />
      <p>Select a request to see it here.</p>
      <p className="detail__empty-hint">
        <Kbd>J</Kbd> <Kbd>K</Kbd> to move · <Kbd>E</Kbd> to advance
      </p>
    </div>
  );
}
