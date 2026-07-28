import { useEffect, useState } from 'react';

import { clearRequestLog, subscribeToRequestLog, type LoggedCall } from '../lib/apiClient';
import { Icon } from './Icon';
import { Kbd } from './Kbd';

/**
 * Every API call the app has made, live.
 *
 * The point is not debugging — the browser's network tab already does that better.
 * The point is that "how data flows through the system" is otherwise the one thing
 * about this app you cannot see by using it. Here you can click *Start work* and
 * watch the PATCH go out, come back 200, and carry a request id that matches a line
 * in the server's logs.
 */
export function RequestLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [calls, setCalls] = useState<LoggedCall[]>([]);

  useEffect(() => subscribeToRequestLog(setCalls), []);

  if (!open) return null;

  return (
    <aside className="reqlog" aria-label="API request log">
      <header className="reqlog__head">
        <span className="reqlog__title">
          <Icon name="activity" size={13} />
          Request log
        </span>
        <span className="reqlog__hint">
          every call this tab has made · <Kbd>G</Kbd>
        </span>
        <div className="reqlog__spacer" />
        <button type="button" className="reqlog__action" onClick={clearRequestLog}>
          Clear
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Hide request log">
          <Icon name="close" size={14} />
        </button>
      </header>

      <ol className="reqlog__list">
        {calls.length === 0 ? (
          <li className="reqlog__empty">Nothing yet — interact with the queue.</li>
        ) : (
          calls.map((call) => (
            <li className="reqlog__row" key={call.id} data-status={statusBand(call.status)}>
              <span className="reqlog__method">{call.method}</span>
              <span className="reqlog__path">{call.path}</span>
              <span className="reqlog__status">{call.status}</span>
              <span className="reqlog__duration">{call.durationMs}ms</span>
              <span className="reqlog__id" title={call.requestId ?? undefined}>
                {call.requestId?.slice(0, 8) ?? '—'}
              </span>
            </li>
          ))
        )}
      </ol>
    </aside>
  );
}

function statusBand(status: number): 'ok' | 'client' | 'server' {
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  return 'ok';
}
