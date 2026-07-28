import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ADVANCE_LABELS, NEXT_STATUS, type ClientRequest } from '../../types/request';

type StatusControlProps = {
  request: ClientRequest;
  isPending: boolean;
  onAdvance: (request: ClientRequest) => void;
};

/**
 * The one action on a row.
 *
 * The label names the destination — "Start work", "Mark done" — rather than a
 * generic "Next", so the outcome is legible before the click. At the terminal
 * state there is no button at all: a permanently disabled control with no
 * explanation just invites people to keep clicking it.
 */
export function StatusControl({ request, isPending, onAdvance }: StatusControlProps) {
  const next = NEXT_STATUS[request.status];
  const label = ADVANCE_LABELS[request.status];

  if (!next || !label) {
    return (
      <span className="priority" data-priority="low">
        Closed
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      state={isPending ? 'loading' : 'idle'}
      loadingLabel={label}
      leading={<Icon name={request.status === 'new' ? 'arrowRight' : 'tick'} size={13} />}
      onClick={(event) => {
        // The row itself is clickable for selection; the action must not also select.
        event.stopPropagation();
        onAdvance(request);
      }}
    >
      {label}
    </Button>
  );
}
