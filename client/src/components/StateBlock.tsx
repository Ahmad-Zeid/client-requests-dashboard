import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

type StateBlockProps = {
  icon: IconName;
  title: string;
  body: string;
  tone?: 'neutral' | 'error';
  action?: ReactNode;
};

/**
 * Empty and error states share a shape: a small mark, one line saying why you are
 * looking at nothing, and the action that resolves it. A bare "No results" tells
 * the user nothing they could not already see.
 */
export function StateBlock({ icon, title, body, tone = 'neutral', action }: StateBlockProps) {
  return (
    <div className={`state${tone === 'error' ? ' state--error' : ''}`}>
      <span className="state__icon">
        <Icon name={icon} size={18} />
      </span>
      <h2 className="state__title">{title}</h2>
      <p className="state__body">{body}</p>
      {action}
    </div>
  );
}
