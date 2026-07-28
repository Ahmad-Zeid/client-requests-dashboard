/**
 * One icon set, hand-drawn, one stroke voice.
 *
 * Icons are typography — mixing three libraries in one interface reads the same
 * way three body fonts would. These share a 24-unit grid, a 1.75 stroke, round
 * caps and joins, so they sit together. No emoji standing in for an icon.
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
  | 'signOut';

const PATHS: Record<IconName, React.ReactNode> = {
  inbox: (
    <>
      <path d="M3 13h4l1.5 3h7L17 13h4" />
      <path d="M3 13 5.6 5.4A2 2 0 0 1 7.5 4h9a2 2 0 0 1 1.9 1.4L21 13v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  // Button-scale glyphs: a single stroke, legible at 14px. The circled variants
  // below carry too much detail to survive at that size.
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
  signOut: (
    <>
      <path d="M14.5 8V5.5a1.5 1.5 0 0 0-1.5-1.5H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h7a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M10 12h9.5m0 0-3-3m3 3-3 3" />
    </>
  ),
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
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
