/** A keycap. Used in the palette footer, the rail hint, and the shortcut sheet. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** A sequence of keycaps, e.g. ⌘ K or ⇧ E. */
export function KbdGroup({ keys }: { keys: string[] }) {
  return (
    <span className="kbd-group">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
