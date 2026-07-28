import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { ApiClientError } from '../../lib/apiClient';
import { useAuth } from './AuthContext';

type Touched = { email: boolean; password: boolean };

/**
 * Two columns, left-biased: the form sits in the wider column and a quiet panel
 * on the right says what the tool does. Not a centred card floating in an empty
 * viewport — that shape is the default generated-login look, and it wastes the
 * one screen where a new user has no other context.
 */
export function SignInPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Touched>({ email: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (status === 'authenticated') {
    return <Navigate to="/requests" replace />;
  }

  // Validation runs on blur, then live once a field has been touched — so nobody
  // is told their email is invalid while they are still typing the first letter.
  const emailError =
    touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'Enter a valid email address.'
      : undefined;
  const passwordError =
    touched.password && password.length === 0 ? 'Enter your password.' : undefined;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !emailError;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (!canSubmit) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await signIn(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/requests', { replace: true });
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : 'Could not reach the server. Check that the API is running and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin__form-col">
        <div className="signin__inner">
          <div className="signin__brand">
            <span className="rail__logo" aria-hidden="true">
              CR
            </span>
            <span className="rail__mark">Requests</span>
          </div>

          <h1 className="signin__title">Sign in</h1>
          <p className="signin__lede">
            The internal queue for incoming client work — what came in, who it is for, and where it
            stands.
          </p>

          <form className="signin__form" onSubmit={handleSubmit} noValidate>
            {formError ? (
              <p className="dialog__error" role="alert">
                {formError}
              </p>
            ) : null}

            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="ops@example.com"
              value={email}
              error={emailError}
              required
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched((previous) => ({ ...previous, email: true }))}
            />

            <TextField
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              error={passwordError}
              required
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched((previous) => ({ ...previous, password: true }))}
            />

            <Button
              type="submit"
              variant="primary"
              block
              state={submitting ? 'loading' : 'idle'}
              loadingLabel="Signing in…"
            >
              Sign in
            </Button>
          </form>

          <div className="signin__demo">
            <p className="signin__demo-label">Demo account</p>
            <p className="signin__demo-row">
              <span>ops@example.com</span>
              <span>demo1234</span>
            </p>
          </div>
        </div>
      </div>

      <aside className="signin__aside">
        <p className="signin__aside-heading">How a request moves</p>

        <ol className="signin__flow">
          <li className="signin__flow-item">
            <span className="status__dot" data-signin-dot="new" />
            <div>
              <p className="signin__flow-title">New</p>
              <p className="signin__flow-body">
                Logged against a client, with a priority and enough detail to pick it up.
              </p>
            </div>
          </li>
          <li className="signin__flow-item">
            <span className="status" data-status="in_progress">
              <span className="status__dot" aria-hidden="true" />
            </span>
            <div>
              <p className="signin__flow-title">In progress</p>
              <p className="signin__flow-body">Someone has started. The queue shows it as taken.</p>
            </div>
          </li>
          <li className="signin__flow-item">
            <span className="status" data-status="done">
              <span className="status__dot" aria-hidden="true" />
            </span>
            <div>
              <p className="signin__flow-title">Done</p>
              <p className="signin__flow-body">
                Closed for good — the server refuses to move it backwards.
              </p>
            </div>
          </li>
        </ol>
      </aside>
    </div>
  );
}
