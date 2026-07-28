import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { Button } from './Button';
import { StateBlock } from './StateBlock';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render-time crashes so a bug in one component shows a recoverable
 * message instead of a blank white page.
 *
 * In production `componentDidCatch` is where an error reporter would be wired in;
 * the console is standing in for that here.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="main">
          <StateBlock
            icon="alert"
            tone="error"
            title="Something broke on this screen"
            body="The error has been logged. Reloading usually clears it — if it keeps happening, the details are in the browser console."
            action={
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Reload the page
              </Button>
            }
          />
        </main>
      );
    }

    return this.props.children;
  }
}
