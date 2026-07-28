/**
 * One icon set, hand-drawn, one stroke voice.
 *
 * Icons are typography — mixing three libraries in one interface reads the same
 * way three body fonts would. These share a 24-unit grid, a 1.7 stroke, round caps
 * and joins, so they sit together. No emoji standing in for an icon.
 */

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export type IconName =
  | 'inbox'
  | 'arrowRight'
  | 'tick'
  | 'check'
  | 'plus'
  | 'search'
  | 'close'
  | 'alert'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'signOut'
  | 'sun'
  | 'moon'
  | 'command'
  | 'keyboard'
  | 'filter'
  | 'layers'
  | 'list'
  | 'cornerDownLeft'
  | 'arrowUpDown'
  | 'users'
  | 'activity'
  | 'refresh';

const PATHS: Record<IconName, React.ReactNode> = {
  inbox: (
    <>
      <path d="M3 13h4l1.5 3h7L17 13h4" />
      <path d="M3 13 5.6 5.4A2 2 0 0 1 7.5 4h9a2 2 0 0 1 1.9 1.4L21 13v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  arrowRight: <path d="M4.5 12h15m0 0-5-5m5 5-5 5" />,
  tick: <path d="m5 12.5 4.6 4.6L19 6.9" />,
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.6 12.2 2.3 2.3 4.5-4.9" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m15.8 15.8 3.4 3.4" />
    </>
  ),
  close: <path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" />,
  alert: (
    <>
      <path d="M12 4.8 2.9 19.2h18.2z" />
      <path d="M12 10v4" />
      <path d="M12 16.6h.01" />
    </>
  ),
  chevronLeft: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  chevronRight: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
  chevronDown: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  signOut: (
    <>
      <path d="M14.5 8V5.5a1.5 1.5 0 0 0-1.5-1.5H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M10 12h9.5m0 0-3-3m3 3-3 3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.1M12 19.1v2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M2.8 12h2.1M19.1 12h2.1M5.5 18.5 7 17M17 7l1.5-1.5" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z" />,
  command: (
    <path d="M9 6a2.5 2.5 0 1 0-2.5 2.5H18A2.5 2.5 0 1 1 15.5 6v12a2.5 2.5 0 1 0 2.5-2.5H6a2.5 2.5 0 1 1 2.5 2.5z" />
  ),
  keyboard: (
    <>
      <rect x="2.6" y="6" width="18.8" height="12" rx="2.2" />
      <path d="M6.5 9.8h.01M10 9.8h.01M13.5 9.8h.01M17 9.8h.01M6.5 13h.01M17 13h.01M9.6 14.6h4.8" />
    </>
  ),
  filter: <path d="M4 6.2h16L14 13v5.4l-4 1.9V13z" />,
  layers: (
    <>
      <path d="m12 3.5 8.5 4.3-8.5 4.3-8.5-4.3z" />
      <path d="m3.5 12.4 8.5 4.3 8.5-4.3" />
    </>
  ),
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.6 6.5h.01M3.6 12h.01M3.6 17.5h.01" />,
  cornerDownLeft: <path d="M19 5.5v6.2a2.3 2.3 0 0 1-2.3 2.3H6m0 0 4-4m-4 4 4 4" />,
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M3.2 19.4a6 6 0 0 1 11.6 0" />
      <path d="M16.2 5.6a3.4 3.4 0 0 1 0 5.9" />
      <path d="M17.6 14.4a6 6 0 0 1 3.2 5" />
    </>
  ),
  activity: <path d="M3 12.2h3.6l2.6-7 3.4 13.6 2.7-6.6h5.7" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.4 4.2v4.6h-4.6" />
    </>
  ),
  arrowUpDown: <path d="M8 4.5v15m0-15-3 3m3-3 3 3M16 19.5v-15m0 15 3-3m-3 3-3-3" />,
};

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
