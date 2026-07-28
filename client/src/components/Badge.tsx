import { STATUS_LABELS, type RequestPriority, type RequestStatus } from '../types/request';

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className="badge" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * Priority is metadata, status is the thing you act on — so priority gets a quiet
 * marker rather than a second pill. Two identical pill columns side by side flatten
 * the hierarchy and make the row harder to scan, not easier.
 */
export function PriorityMarker({ priority }: { priority: RequestPriority }) {
  return (
    <span className="priority" data-priority={priority}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
