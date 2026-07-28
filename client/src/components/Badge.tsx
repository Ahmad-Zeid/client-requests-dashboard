import { STATUS_LABELS, type RequestPriority, type RequestStatus } from '../types/request';

/**
 * The status glyph carries the meaning, not the colour: `new` is a hollow ring
 * (not started), `in_progress` is half-filled (underway), `done` is solid. That
 * ordering is legible in greyscale and to anyone who can't distinguish the hues.
 */
export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className="status" data-status={status}>
      <span className="status__dot" aria-hidden="true" />
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
 * Priority is context, status is the thing you act on — so priority gets a quiet
 * marker rather than a second badge. Two identical pill columns side by side
 * flatten the hierarchy and make the row harder to scan.
 */
export function PriorityMarker({ priority }: { priority: RequestPriority }) {
  return (
    <span className="priority" data-priority={priority}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
