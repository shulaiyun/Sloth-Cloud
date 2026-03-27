import { useSite } from '../lib/site-context';

export function ThemeToggle() {
  const { theme, setTheme, text } = useSite();

  return (
    <button
      className="toggle-button"
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? text.common.themeDark : text.common.themeLight}
    </button>
  );
}
