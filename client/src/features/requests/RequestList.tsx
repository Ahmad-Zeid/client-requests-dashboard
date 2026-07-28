import { useEffect, useRef } from 'react';

import { Icon } from '../../components/Icon';
import { STATUS_LABELS, type ClientRequest, type RequestStatus } from '../../types/request';

type RequestListProps = {
  requests: ClientRequest[];
  selectedId: string | null;
  pendingId: string | null;
  flashId: string | null;
  grouped: boolean;
  collapsedGroups: Set<RequestStatus>;
  onSelect: (request: ClientRequest) => void;
  onToggleGroup: (status: RequestStatus) => void;
};

/** Compact relative age. The list is scanned, not read. */
function formatAge(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  return `${Math.round(hours / 24)}d`;
}

function Item({
  request,
  selected,
  pending,
  flash,
  onSelect,
}: {
  request: ClientRequest;
  selected: boolean;
  pending: boolean;
  flash: boolean;
  onSelect: (request: ClientRequest) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  // Keeps the keyboard cursor on screen as j/k walks past the fold.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <li
      ref={ref}
      className="request-item"
      data-selected={selected || undefined}
      data-pending={pending || undefined}
      data-flash={flash || undefined}
      data-attention={request.attention ? 'true' : undefined}
    >
      <button type="button" className="request-item__button" onClick={() => onSelect(request)}>
        <span className="request-item__status" data-status={request.status} aria-hidden="true">
          <span className="status__dot" />
        </span>

        <span className="request-item__main">
          <span className="request-item__title">{request.title}</span>
          <span className="request-item__meta">
            <span className="request-item__client">{request.clientName}</span>
            <span className="request-item__dot" aria-hidden="true">
              ·
            </span>
            <span className="numeric">{formatAge(request.createdAt)}</span>
            {request.priority === 'high' ? (
              <span className="request-item__priority">High</span>
            ) : null}
          </span>
        </span>

        {request.attention ? (
          <span className="request-item__flag" title={request.attention.label}>
            <Icon name="alert" size={13} />
            <span className="visually-hidden">{request.attention.label}</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * The queue itself — narrow, dense, and built to be walked with the keyboard rather
 * than read like a report. Selecting an item updates the detail pane immediately; no
 * modal opens, because a modal interrupts the thing you are in the middle of doing.
 */
export function RequestList({
  requests,
  selectedId,
  pendingId,
  flashId,
  grouped,
  collapsedGroups,
  onSelect,
  onToggleGroup,
}: RequestListProps) {
  const itemProps = (request: ClientRequest) => ({
    request,
    selected: request.id === selectedId,
    pending: request.id === pendingId,
    flash: request.id === flashId,
    onSelect,
  });

  if (!grouped) {
    return (
      <ul className="request-list" aria-label="Client requests">
        {requests.map((request) => (
          <Item key={request.id} {...itemProps(request)} />
        ))}
      </ul>
    );
  }

  return (
    <div className="request-list-groups">
      {(['new', 'in_progress', 'done'] as const).map((status) => {
        const rows = requests.filter((request) => request.status === status);
        if (rows.length === 0) return null;

        const collapsed = collapsedGroups.has(status);

        return (
          <section key={status} className="request-group">
            <button
              type="button"
              className="request-group__head"
              aria-expanded={!collapsed}
              onClick={() => onToggleGroup(status)}
            >
              <Icon name="chevronDown" size={12} className="request-group__chevron" />
              {STATUS_LABELS[status]}
              <span className="request-group__count">{rows.length}</span>
            </button>

            {collapsed ? null : (
              <ul className="request-list" aria-label={STATUS_LABELS[status]}>
                {rows.map((request) => (
                  <Item key={request.id} {...itemProps(request)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Skeleton items matching the real list's rhythm, so nothing jumps when data lands. */
export function RequestListSkeleton({ rows = 9 }: { rows?: number }) {
  const widths = ['78%', '56%', '68%', '48%', '72%', '60%', '82%', '52%', '66%'];

  return (
    <ul className="request-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li className="request-item" key={index}>
          <div className="request-item__button">
            <span className="request-item__status">
              <span className="status__dot" />
            </span>
            <span className="request-item__main">
              <span className="skeleton" style={{ width: widths[index % widths.length] }} />
              <span
                className="skeleton"
                style={{ width: '40%', height: '0.55rem', marginTop: 6 }}
              />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
