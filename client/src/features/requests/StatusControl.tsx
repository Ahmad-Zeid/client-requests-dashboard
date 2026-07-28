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
 * state the button is gone and replaced by plain text: a disabled control with no
 * explanation just invites people to keep clicking it.
 */
export function StatusControl({ request, isPending, onAdvance }: StatusControlProps) {
  const next = NEXT_STATUS[request.status];
  const label = ADVANCE_LABELS[request.status];

  if (!next || !label) {
    return (
      <span className="pagination__summary" style={{ display: 'inline-flex', gap: 6 }}>
        <Icon name="check" size={14} />
        Closed
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant={request.status === 'new' ? 'secondary' : 'primary'}
      state={isPending ? 'loading' : 'idle'}
      loadingLabel={label}
      leading={<Icon name={request.status === 'new' ? 'arrowRight' : 'tick'} size={14} />}
      onClick={() => onAdvance(request)}
    >
      {label}
    </Button>
  );
}
