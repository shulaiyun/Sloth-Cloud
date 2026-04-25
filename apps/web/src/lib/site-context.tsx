import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { content, localeMeta, supportedFrontendLocales, type Locale } from './content';

type Theme = 'dark' | 'light';
export type ThemeDomain = 'commerce' | 'console';

const themeStorageKeys: Record<ThemeDomain, string> = {
  commerce: 'sloth-cloud-theme-commerce',
  console: 'sloth-cloud-theme-console',
};

function safeLocalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode / quota / blocked storage).
  }
}

function defaultThemeForDomain(domain: ThemeDomain): Theme {
  return domain === 'console' ? 'dark' : 'light';
}

export function resolveThemeDomain(pathname: string): ThemeDomain {
  return pathname.startsWith('/services')
    || pathname.startsWith('/affiliate')
    || pathname.startsWith('/operator')
    || pathname.startsWith('/operator-lab')
    || pathname.startsWith('/workspaces/')
    || pathname.startsWith('/capsules/')
    ? 'console'
    : 'commerce';
}

interface SiteContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themeDomain: ThemeDomain;
  setThemeDomain: (domain: ThemeDomain) => void;
  text: (typeof content)[Locale];
  formatMoney: (value: number | null, currency: string) => string;
  formatDate: (value: string | null) => string;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const value = safeLocalStorageGet('sloth-cloud-locale');
    if (!value || !(value in localeMeta)) {
      return 'zh-CN';
    }

    const parsed = value as Locale;
    return supportedFrontendLocales.includes(parsed) ? parsed : 'zh-CN';
  });
  const [themeDomain, setThemeDomain] = useState<ThemeDomain>('commerce');
  const [themePreferences, setThemePreferences] = useState<Record<ThemeDomain, Theme>>(() => ({
    commerce: safeLocalStorageGet(themeStorageKeys.commerce) === 'dark' ? 'dark' : 'light',
    console: safeLocalStorageGet(themeStorageKeys.console) === 'light' ? 'light' : 'dark',
  }));
  const theme = themePreferences[themeDomain] ?? defaultThemeForDomain(themeDomain);

  useEffect(() => {
    document.documentElement.lang = locale;
    safeLocalStorageSet('sloth-cloud-locale', locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeDomain = themeDomain;
    safeLocalStorageSet(themeStorageKeys.commerce, themePreferences.commerce);
    safeLocalStorageSet(themeStorageKeys.console, themePreferences.console);
  }, [theme, themeDomain, themePreferences]);

  const text = content[locale];

  const value = useMemo<SiteContextValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme(nextTheme) {
      setThemePreferences((state) => ({
        ...state,
        [themeDomain]: nextTheme,
      }));
    },
    themeDomain,
    setThemeDomain,
    text,
    formatMoney(number, currency) {
      if (number === null) {
        return text.common.pending;
      }

      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(number);
    },
    formatDate(dateString) {
      if (!dateString) {
        return text.common.pending;
      }

      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(dateString));
    },
  }), [locale, text, theme, themeDomain]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used within SiteProvider');
  }

  return context;
}
