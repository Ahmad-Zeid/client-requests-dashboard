import { PriorityMarker, StatusBadge } from '../../components/Badge';
import type { ClientRequest } from '../../types/request';
import { StatusControl } from './StatusControl';

type RequestsTableProps = {
  requests: ClientRequest[];
  pendingId: string | null;
  onAdvance: (request: ClientRequest) => void;
};

/** Short, unambiguous relative time. Falls back to a date past a week. */
function formatUpdatedAt(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * A real `<table>`, because this is real tabular data — screen readers announce
 * row and column relationships for free, and that is not something a grid of divs
 * gives you back.
 *
 * Below 768px CSS restyles it into cards. Each cell carries `data-label` so the
 * column name reappears beside the value once the header row is visually hidden.
 */
export function RequestsTable({ requests, pendingId, onAdvance }: RequestsTableProps) {
  return (
    <div className="panel">
      <table className="table">
        <caption className="visually-hidden">
          Client requests, newest first. Each row can be advanced to its next status.
        </caption>
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Client</th>
            <th scope="col" className="col-status">
              Priority
            </th>
            <th scope="col" className="col-status">
              Status
            </th>
            <th scope="col" className="col-updated">
              Updated
            </th>
            <th scope="col" className="col-actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {requests.map((request) => (
            <tr key={request.id} data-pending={request.id === pendingId ? 'true' : undefined}>
              <td data-label="Request">
                <span className="cell-title">{request.title}</span>
                {request.description ? (
                  <span className="cell-description">{request.description}</span>
                ) : null}
              </td>

              <td data-label="Client" className="cell-client">
                {request.clientName}
              </td>

              <td data-label="Priority">
                <PriorityMarker priority={request.priority} />
              </td>

              <td data-label="Status">
                <StatusBadge status={request.status} />
              </td>

              <td data-label="Updated">
                <span className="numeric" title={new Date(request.updatedAt).toLocaleString()}>
                  {formatUpdatedAt(request.updatedAt)}
                </span>
              </td>

              <td data-label="Action" className="cell-actions">
                <StatusControl
                  request={request}
                  isPending={request.id === pendingId}
                  onAdvance={onAdvance}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Skeleton rows, not a spinner. The shape of the table is known before the data
 * arrives, so showing that shape avoids the layout jolt a spinner guarantees.
 */
export function RequestsTableSkeleton({ rows = 6 }: { rows?: number }) {
  const widths = ['72%', '54%', '64%', '48%', '68%', '58%'];

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
                <div className="skeleton" style={{ width: '7rem' }} />
              </td>
              <td>
                <div className="skeleton" style={{ width: '4rem' }} />
              </td>
              <td>
                <div className="skeleton" style={{ width: '5rem' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
