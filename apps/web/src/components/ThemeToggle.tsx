import React from 'react';
import { useSite } from '../lib/site-context';

export function ThemeToggle() {
  const { locale, theme, setTheme } = useSite();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark'
    ? (locale.startsWith('zh') ? '黑暗' : 'Dark')
    : (locale.startsWith('zh') ? '明亮' : 'Light');

  return (
    <button
      className="toggle-button"
      onClick={() => setTheme(nextTheme)}
      type="button"
    >
      {label}
    </button>
  );
}
