import { useSite } from '../lib/site-context';

export function ThemeToggle() {
  const { theme, setTheme } = useSite();

  return (
    <button
      className="toggle-button"
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}

