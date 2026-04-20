import { FlagIcon } from './FlagIcon';
import { localeMeta, supportedFrontendLocales, type Locale } from '../lib/content';
import { useSite } from '../lib/site-context';
import { getUiText } from '../lib/ui-text';

export function LanguageToggle() {
  const { locale, setLocale } = useSite();
  const ui = getUiText(locale);
  const entries = supportedFrontendLocales.map((code) => [code, localeMeta[code]] as [Locale, (typeof localeMeta)[Locale]]);

  return (
    <details className="locale-menu">
      <summary className="toggle-button locale-trigger">
        <span className="locale-trigger-meta">
          <FlagIcon locale={locale} />
          <span className="locale-trigger-copy">
            <span className="locale-code" translate="no">{localeMeta[locale].code}</span>
            <span>{localeMeta[locale].label}</span>
          </span>
        </span>
        <span className="locale-caret">▾</span>
      </summary>
      <div className="locale-menu-list">
        <div className="locale-menu-head">
          <span>{ui.common.interfaceLanguage}</span>
          <small>{ui.common.selectLanguage}</small>
        </div>
        {entries.map(([code, meta]) => (
          <button
            className={`locale-option ${code === locale ? 'active' : ''}`}
            key={code}
            type="button"
            onClick={(event) => {
              setLocale(code);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
          >
            <FlagIcon locale={code} />
            <span>{meta.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
