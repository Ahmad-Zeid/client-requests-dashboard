import { PriorityMarker, StatusBadge } from '../../components/Badge';
import { Icon } from '../../components/Icon';
import { REQUEST_STATUSES, STATUS_LABELS, type ClientRequest, type RequestStatus } from '../../types/request';
import { StatusControl } from './StatusControl';

type RequestsTableProps = {
  requests: ClientRequest[];
  selectedId: string | null;
  pendingId: string | null;
  flashId: string | null;
  grouped: boolean;
  collapsedGroups: Set<RequestStatus>;
  onSelect: (request: ClientRequest) => void;
  onOpen: (request: ClientRequest) => void;
  onAdvance: (request: ClientRequest) => void;
  onToggleGroup: (status: RequestStatus) => void;
};

/** Short relative time; falls back to a date past a week. */
function formatUpdatedAt(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Row({
  request,
  selectedId,
  pendingId,
  flashId,
  onSelect,
  onOpen,
  onAdvance,
}: Pick<
  RequestsTableProps,
  'selectedId' | 'pendingId' | 'flashId' | 'onSelect' | 'onOpen' | 'onAdvance'
> & { request: ClientRequest }) {
  return (
    <tr
      data-selected={request.id === selectedId ? 'true' : undefined}
      data-pending={request.id === pendingId ? 'true' : undefined}
      data-flash={request.id === flashId ? 'true' : undefined}
      onClick={() => onSelect(request)}
      onDoubleClick={() => onOpen(request)}
    >
      <td data-label="Request">
        <span className="cell-title">{request.title}</span>
      </td>

      <td data-label="Client" className="cell-client">
        {request.clientName}
      </td>

      <td data-label="Priority" className="col-narrow">
        <PriorityMarker priority={request.priority} />
      </td>

      <td data-label="Status" className="col-narrow">
        <StatusBadge status={request.status} />
      </td>

      <td data-label="Updated" className="col-narrow">
        <span className="numeric" title={new Date(request.updatedAt).toLocaleString()}>
          {formatUpdatedAt(request.updatedAt)}
        </span>
      </td>

      <td data-label="Action" className="cell-actions col-narrow">
        <StatusControl
          request={request}
          isPending={request.id === pendingId}
          onAdvance={onAdvance}
        />
      </td>
    </tr>
  );
}

/**
 * A real `<table>`, because this is real tabular data — assistive tech announces
 * row and column relationships for free, which a grid of divs throws away.
 *
 * Below 768px CSS restyles it into cards; each cell carries `data-label` so the
 * column name reappears beside the value once the header row is hidden.
 */
export function RequestsTable({
  requests,
  selectedId,
  pendingId,
  flashId,
  grouped,
  collapsedGroups,
  onSelect,
  onOpen,
  onAdvance,
  onToggleGroup,
}: RequestsTableProps) {
  const rowProps = { selectedId, pendingId, flashId, onSelect, onOpen, onAdvance };

  return (
    <div className="panel">
      <table className="table">
        <caption className="visually-hidden">
          Client requests. Use J and K to move between rows, Enter to open one, and E to advance it.
        </caption>

        {/* Explicit widths, because the table uses `table-layout: fixed`. The first
            column takes whatever is left, which is what lets a long title ellipsis
            instead of widening the page. Ignored below 768px, where rows become cards. */}
        <colgroup>
          <col />
          <col style={{ width: '11rem' }} />
          <col style={{ width: '7rem' }} />
          <col style={{ width: '8.5rem' }} />
          <col style={{ width: '6rem' }} />
          <col style={{ width: '8rem' }} />
        </colgroup>

        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Client</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>

        {grouped ? (
          REQUEST_STATUSES.map((status) => {
            const rows = requests.filter((request) => request.status === status);
            if (rows.length === 0) return null;

            const collapsed = collapsedGroups.has(status);

            return (
              <tbody key={status}>
                <tr className="table__group-head">
                  <th scope="colgroup" colSpan={6}>
                    <button
                      type="button"
                      className="table__group-toggle"
                      aria-expanded={!collapsed}
                      onClick={() => onToggleGroup(status)}
                    >
                      <Icon name="chevronDown" size={13} className="table__group-chevron" />
                      {STATUS_LABELS[status]}
                      <span className="table__group-count">{rows.length}</span>
                    </button>
                  </th>
                </tr>

                {collapsed
                  ? null
                  : rows.map((request) => (
                      <Row key={request.id} request={request} {...rowProps} />
                    ))}
              </tbody>
            );
          })
        ) : (
          <tbody>
            {requests.map((request) => (
              <Row key={request.id} request={request} {...rowProps} />
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

/**
 * Skeleton rows, not a spinner. The shape of the table is known before the data
 * arrives, so showing that shape avoids the layout jolt a spinner guarantees.
 */
export function RequestsTableSkeleton({ rows = 8 }: { rows?: number }) {
  const widths = ['64%', '48%', '58%', '42%', '61%', '52%', '69%', '45%'];

  return (
    <div className="panel" aria-hidden="true">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <tr key={index}>
              <td>
                <div className="skeleton" style={{ width: widths[index % widths.length] }} />
              </td>
              <td>
                <div className="skeleton" style={{ width: '6rem' }} />
              </td>
              <td className="col-narrow">
                <div className="skeleton" style={{ width: '3.5rem' }} />
              </td>
              <td className="col-narrow">
                <div className="skeleton" style={{ width: '4.5rem' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
