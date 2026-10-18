import { useI18n } from './index';

export default function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label="Language / 语言">
      <button
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        Eng
      </button>
      <button
        type="button"
        lang="zh-CN"
        aria-label="中文"
        aria-pressed={locale === 'zh'}
        onClick={() => setLocale('zh')}
      >
        中文
      </button>
    </div>
  );
}
