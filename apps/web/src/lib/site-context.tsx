import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { content, type Locale } from './content';

type Theme = 'dark' | 'light';

interface SiteContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  text: (typeof content)[Locale];
  formatMoney: (value: number | null, currency: string) => string;
  formatDate: (value: string | null) => string;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const value = window.localStorage.getItem('sloth-cloud-locale');
    return value === 'en-US' ? 'en-US' : 'zh-CN';
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const value = window.localStorage.getItem('sloth-cloud-theme');
    return value === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem('sloth-cloud-locale', locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('sloth-cloud-theme', theme);
  }, [theme]);

  const value = useMemo<SiteContextValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme,
    text: content[locale],
    formatMoney(number, currency) {
      if (number === null) {
        return locale === 'zh-CN' ? '待补充' : 'Pending';
      }

      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(number);
    },
    formatDate(dateString) {
      if (!dateString) {
        return locale === 'zh-CN' ? '待补充' : 'Pending';
      }

      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(dateString));
    },
  }), [locale, theme]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used within SiteProvider');
  }

  return context;
}

