import { useSite } from '../lib/site-context';

export function LanguageToggle() {
  const { locale, setLocale, text } = useSite();

  return (
    <button
      className="toggle-button"
      type="button"
      onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
    >
      {locale === 'zh-CN' ? text.common.languageZh : text.common.languageEn}
    </button>
  );
}
