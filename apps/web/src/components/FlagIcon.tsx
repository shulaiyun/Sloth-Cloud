import type { ReactNode } from 'react';

type FlagIconProps = {
  locale: string;
};

function FlagSvg({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" className="flag-icon" viewBox="0 0 24 16">
      {children}
    </svg>
  );
}

export function FlagIcon({ locale }: FlagIconProps) {
  switch (locale) {
    case 'zh-CN':
      return (
        <FlagSvg>
          <rect fill="#d81e06" height="16" rx="3" width="24" />
          <circle cx="6" cy="5" fill="#ffd84d" r="1.4" />
          <circle cx="8.5" cy="3.4" fill="#ffd84d" r="0.5" />
          <circle cx="9.2" cy="6.6" fill="#ffd84d" r="0.5" />
        </FlagSvg>
      );
    case 'zh-TW':
      return (
        <FlagSvg>
          <rect fill="#d81e06" height="16" rx="3" width="24" />
          <rect fill="#1f4aa8" height="8" rx="3" width="11" />
          <circle cx="5.2" cy="4" fill="#ffffff" r="1.8" />
        </FlagSvg>
      );
    case 'en-US':
      return (
        <FlagSvg>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <rect fill="#c81e2a" height="1.65" width="24" y="0" />
          <rect fill="#c81e2a" height="1.65" width="24" y="3.3" />
          <rect fill="#c81e2a" height="1.65" width="24" y="6.6" />
          <rect fill="#c81e2a" height="1.65" width="24" y="9.9" />
          <rect fill="#c81e2a" height="1.65" width="24" y="13.2" />
          <rect fill="#21468b" height="7.2" rx="3" width="10.6" />
          <circle cx="2.2" cy="1.8" fill="#ffffff" r="0.55" />
          <circle cx="4.1" cy="1.8" fill="#ffffff" r="0.55" />
          <circle cx="6" cy="1.8" fill="#ffffff" r="0.55" />
          <circle cx="3.2" cy="3.7" fill="#ffffff" r="0.55" />
          <circle cx="5.1" cy="3.7" fill="#ffffff" r="0.55" />
        </FlagSvg>
      );
    case 'ja-JP':
      return (
        <FlagSvg>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <circle cx="12" cy="8" fill="#d81e06" r="4.4" />
        </FlagSvg>
      );
    case 'ko-KR':
      return (
        <FlagSvg>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <path
            d="M12 3.6a4.4 4.4 0 0 1 0 8.8 2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 1 1 0-4.4Z"
            fill="#d81e06"
          />
          <path
            d="M12 12.4a4.4 4.4 0 0 1 0-8.8 2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 1 0 4.4Z"
            fill="#0f5db7"
          />
          <path d="M4.3 5.1h3" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M4.7 7h2.8" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M16.5 9h3" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M16.1 10.9h2.8" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
        </FlagSvg>
      );
    case 'de-DE':
      return (
        <FlagSvg>
          <rect fill="#000000" height="5.4" rx="3" width="24" y="0" />
          <rect fill="#dd0000" height="5.4" rx="3" width="24" y="5.3" />
          <rect fill="#ffce00" height="5.4" rx="3" width="24" y="10.6" />
        </FlagSvg>
      );
    case 'fr-FR':
      return (
        <FlagSvg>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <rect fill="#1d4ed8" height="16" rx="3" width="8" />
          <rect fill="#e11d48" height="16" rx="3" width="8" x="16" />
        </FlagSvg>
      );
    case 'es-ES':
      return (
        <FlagSvg>
          <rect fill="#c81e2a" height="16" rx="3" width="24" />
          <rect fill="#ffcf4d" height="8" rx="2" width="24" y="4" />
        </FlagSvg>
      );
    case 'ru-RU':
      return (
        <FlagSvg>
          <rect fill="#ffffff" height="5.4" rx="3" width="24" y="0" />
          <rect fill="#1d4ed8" height="5.4" rx="3" width="24" y="5.3" />
          <rect fill="#d81e06" height="5.4" rx="3" width="24" y="10.6" />
        </FlagSvg>
      );
    case 'pt-BR':
      return (
        <FlagSvg>
          <rect fill="#1f9d55" height="16" rx="3" width="24" />
          <path d="M12 3.2 19.6 8 12 12.8 4.4 8 12 3.2Z" fill="#ffd84d" />
          <circle cx="12" cy="8" fill="#1e40af" r="2.7" />
        </FlagSvg>
      );
    default:
      return (
        <FlagSvg>
          <rect fill="#6fb4ff" height="16" rx="3" width="24" />
          <rect fill="#6cf2d1" height="8" rx="3" width="24" y="8" />
        </FlagSvg>
      );
  }
}
