import { useSite } from '../lib/site-context';

export function LanguageToggle() {
  const { locale, setLocale } = useSite();

  return (
    <button
      className="toggle-button"
      type="button"
      onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
    >
      {locale === 'zh-CN' ? '中文' : 'EN'}
    </button>
  );
}

