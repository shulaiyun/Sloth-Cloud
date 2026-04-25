import React from 'react';
import { useMemo, useRef } from 'react';

import { CountryFlagIcon } from './FlagIcon';
import { localeMeta, supportedFrontendLocales } from '../lib/content';
import { useSite } from '../lib/site-context';

export function LanguageToggle() {
  const { locale, setLocale } = useSite();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const activeMeta = localeMeta[locale];
  const localeOptions = useMemo(
    () => supportedFrontendLocales.map((key) => ({ key, meta: localeMeta[key] })),
    [],
  );

  function closeMenu() {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  return (
    <details className="locale-menu" ref={detailsRef}>
      <summary className="locale-trigger toggle-button">
        <span className="locale-trigger-meta">
          <CountryFlagIcon countryCode={activeMeta.countryCode} />
          <span className="locale-trigger-copy">
            <small className="locale-code">{activeMeta.code}</small>
            <strong>{activeMeta.nativeName}</strong>
          </span>
        </span>
        <span className="locale-caret">▾</span>
      </summary>
      <div className="locale-menu-list" role="listbox">
        <div className="locale-menu-head">
          <span>{locale.startsWith('zh') ? '语言' : 'Language'}</span>
          <small>{locale.startsWith('zh') ? '选择界面语言' : 'Choose interface language'}</small>
        </div>
        {localeOptions.map(({ key, meta }) => (
          <button
            className={`locale-option ${key === locale ? 'active' : ''}`}
            key={key}
            onClick={() => {
              setLocale(key);
              closeMenu();
            }}
            role="option"
            type="button"
          >
            <CountryFlagIcon countryCode={meta.countryCode} />
            <span className="stack-8">
              <strong>{meta.nativeName}</strong>
              <small className="muted">{meta.name}</small>
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}
