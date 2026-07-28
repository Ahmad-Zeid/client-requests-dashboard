import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/Button';
import { SelectField, TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../lib/apiClient';
import { REQUEST_PRIORITIES, type RequestPriority } from '../../types/request';
import { useCreateRequest } from './useRequests';

type NewRequestDialogProps = {
  open: boolean;
  onClose: () => void;
};

const PRIORITY_OPTIONS = REQUEST_PRIORITIES.map((value) => ({
  value,
  label: value === 'low' ? 'Low' : value === 'medium' ? 'Medium' : 'High',
}));

const EMPTY = { clientName: '', title: '', description: '', priority: 'medium' as RequestPriority };

/**
 * Native `<dialog>`, opened with `showModal()`.
 *
 * The platform handles the focus trap, Escape to close, `inert` on the background,
 * and backdrop styling — all things a div-based modal has to reimplement, usually
 * incompletely.
 */
export function NewRequestDialog({ open, onClose }: NewRequestDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({ clientName: false, title: false });
  const createRequest = useCreateRequest();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setValues(EMPTY);
      setTouched({ clientName: false, title: false });
      createRequest.reset();
      dialog.showModal();

      /**
       * `showModal()` focuses the first focusable descendant, which is the close
       * button in the header — so a keyboard user's opening move would be "cancel".
       * React's `autoFocus` cannot help: it fires at mount, when the dialog is
       * still closed and nothing inside it can take focus. Setting it here, after
       * the dialog is actually open, is the only reliable point.
       */
      dialog.querySelector<HTMLInputElement>('input:not([type=hidden])')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // `createRequest` is a stable mutation object; re-running on it would reset
    // the form mid-submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clientNameError =
    touched.clientName && !values.clientName.trim() ? 'Which client is this for?' : undefined;
  const titleError =
    touched.title && !values.title.trim() ? 'Give the request a one-line summary.' : undefined;

  const canSubmit = values.clientName.trim().length > 0 && values.title.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ clientName: true, title: true });
    if (!canSubmit) return;

    try {
      await createRequest.mutateAsync({
        clientName: values.clientName.trim(),
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        priority: values.priority,
      });
      onClose();
    } catch {
      // Surfaced inline below — the dialog stays open so the typing is not lost.
    }
  }

  const submitError = createRequest.error;

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="new-request-title"
      // Covers Escape and any native close path, so React state cannot drift out
      // of sync with whether the dialog is actually open.
      onClose={onClose}
      onCancel={onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="dialog__head">
          <div>
            <h2 className="dialog__title" id="new-request-title">
              Log a request
            </h2>
            <p className="dialog__hint">It enters the queue as “New”.</p>
          </div>
          <button
            type="button"
            className="dialog__close"
            onClick={onClose}
            aria-label="Close without saving"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="dialog__body">
          {submitError ? (
            <p className="dialog__error" role="alert">
              {submitError instanceof ApiClientError
                ? submitError.message
                : 'Could not reach the server. Your input is still here — try again.'}
            </p>
          ) : null}

          <div className="field-grid">
            <TextField
              label="Client"
              placeholder="Cedar Grove Grocers"
              value={values.clientName}
              error={clientNameError}
              required
              onChange={(event) =>
                setValues((previous) => ({ ...previous, clientName: event.target.value }))
              }
              onBlur={() => setTouched((previous) => ({ ...previous, clientName: true }))}
            />

            <SelectField
              label="Priority"
              value={values.priority}
              options={PRIORITY_OPTIONS}
              helper="High surfaces it to the top of triage."
              onChange={(value) =>
                setValues((previous) => ({ ...previous, priority: value as RequestPriority }))
              }
            />
          </div>

          <TextField
            label="Summary"
            placeholder="Checkout abandons on the shipping step"
            value={values.title}
            error={titleError}
            required
            onChange={(event) =>
              setValues((previous) => ({ ...previous, title: event.target.value }))
            }
            onBlur={() => setTouched((previous) => ({ ...previous, title: true }))}
          />

          <TextAreaField
            label="Detail"
            helper="Optional — what was observed, and where."
            placeholder="Roughly a third of carts drop at shipping selection…"
            value={values.description}
            rows={4}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, description: event.target.value }))
            }
          />
        </div>

        <div className="dialog__foot">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            state={createRequest.isPending ? 'loading' : 'idle'}
            loadingLabel="Saving…"
          >
            Log request
          </Button>
        </div>
      </form>
    </dialog>
  );
}
