import { Icon } from '../../components/Icon';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggleTheme}
      // The label names the destination, not the current state — "Switch to light"
      // is unambiguous where "Dark mode" leaves a screen-reader user guessing
      // whether it reports a state or performs an action.
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  );
}
