import { FlagIcon } from './FlagIcon';
import { localeMeta, type Locale } from '../lib/content';
import { useSite } from '../lib/site-context';

export function LanguageToggle() {
  const { locale, setLocale } = useSite();
  const entries = Object.entries(localeMeta) as Array<[Locale, (typeof localeMeta)[Locale]]>;

  return (
    <details className="locale-menu">
      <summary className="toggle-button locale-trigger">
        <FlagIcon locale={locale} />
        <span>{localeMeta[locale].label}</span>
        <span className="locale-caret">v</span>
      </summary>
      <div className="locale-menu-list">
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
