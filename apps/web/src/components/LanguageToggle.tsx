import { FlagIcon } from './FlagIcon';
import { localeMeta, type Locale } from '../lib/content';
import { useSite } from '../lib/site-context';

export function LanguageToggle() {
  const { locale, setLocale } = useSite();
  const entries = Object.entries(localeMeta) as Array<[Locale, (typeof localeMeta)[Locale]]>;

  return (
    <details className="locale-menu">
      <summary className="toggle-button locale-trigger">
        <span className="locale-trigger-meta">
          <FlagIcon locale={locale} />
          <span className="locale-trigger-copy">
            <span className="locale-code">{localeMeta[locale].code}</span>
            <span>{localeMeta[locale].label}</span>
          </span>
        </span>
        <span className="locale-caret">▾</span>
      </summary>
      <div className="locale-menu-list">
        <div className="locale-menu-head">
          <span>界面语言</span>
          <small>选择前台显示语言</small>
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
