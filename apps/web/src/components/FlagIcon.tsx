import type { ReactNode } from 'react';

type FlagIconProps = {
  locale?: string;
  countryCode?: string | null;
  className?: string;
};

function normalizeCountryCode(locale?: string, countryCode?: string | null) {
  const direct = (countryCode ?? '').trim().toUpperCase();
  if (direct.length >= 2) {
    return direct.slice(0, 2);
  }

  const normalizedLocale = (locale ?? '').trim();
  if (normalizedLocale === '') {
    return null;
  }

  const suffix = normalizedLocale.includes('-')
    ? normalizedLocale.split('-').at(-1) ?? ''
    : normalizedLocale;

  return suffix.trim().toUpperCase() || null;
}

function FlagSvg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" className={className ?? 'flag-icon'} viewBox="0 0 24 16">
      {children}
    </svg>
  );
}

function renderFlag(code: string | null, className?: string) {
  switch (code) {
    case 'CN':
      return (
        <FlagSvg className={className}>
          <rect fill="#d81e06" height="16" rx="3" width="24" />
          <circle cx="6" cy="5" fill="#ffd84d" r="1.4" />
          <circle cx="8.5" cy="3.4" fill="#ffd84d" r="0.5" />
          <circle cx="9.2" cy="6.6" fill="#ffd84d" r="0.5" />
        </FlagSvg>
      );
    case 'TW':
      return (
        <FlagSvg className={className}>
          <rect fill="#d81e06" height="16" rx="3" width="24" />
          <rect fill="#1f4aa8" height="8" rx="3" width="11" />
          <circle cx="5.2" cy="4" fill="#ffffff" r="1.8" />
        </FlagSvg>
      );
    case 'HK':
      return (
        <FlagSvg className={className}>
          <rect fill="#de2910" height="16" rx="3" width="24" />
          <g transform="translate(12 8)">
            <ellipse cx="0" cy="-2.7" fill="#ffffff" rx="1.15" ry="2.7" />
            <ellipse cx="0" cy="-2.7" fill="#ffffff" rx="1.15" ry="2.7" transform="rotate(72)" />
            <ellipse cx="0" cy="-2.7" fill="#ffffff" rx="1.15" ry="2.7" transform="rotate(144)" />
            <ellipse cx="0" cy="-2.7" fill="#ffffff" rx="1.15" ry="2.7" transform="rotate(216)" />
            <ellipse cx="0" cy="-2.7" fill="#ffffff" rx="1.15" ry="2.7" transform="rotate(288)" />
            <circle cx="0" cy="0" fill="#de2910" r="0.9" />
          </g>
        </FlagSvg>
      );
    case 'US':
      return (
        <FlagSvg className={className}>
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
    case 'JP':
      return (
        <FlagSvg className={className}>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <circle cx="12" cy="8" fill="#d81e06" r="4.4" />
        </FlagSvg>
      );
    case 'KR':
      return (
        <FlagSvg className={className}>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <path
            d="M12 3.7a4.3 4.3 0 0 1 0 8.6 2.15 2.15 0 1 0 0-4.3 2.15 2.15 0 1 1 0-4.3Z"
            fill="#d81e06"
          />
          <path
            d="M12 12.3a4.3 4.3 0 0 1 0-8.6 2.15 2.15 0 1 0 0 4.3 2.15 2.15 0 1 1 0 4.3Z"
            fill="#0f5db7"
          />
          <path d="M4.4 5.1h3" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M4.8 7h2.8" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M16.4 9h3" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
          <path d="M16 10.9h2.8" stroke="#1a1a1a" strokeLinecap="round" strokeWidth="1" />
        </FlagSvg>
      );
    case 'DE':
      return (
        <FlagSvg className={className}>
          <rect fill="#000000" height="5.4" rx="3" width="24" y="0" />
          <rect fill="#dd0000" height="5.4" rx="3" width="24" y="5.3" />
          <rect fill="#ffce00" height="5.4" rx="3" width="24" y="10.6" />
        </FlagSvg>
      );
    case 'FR':
      return (
        <FlagSvg className={className}>
          <rect fill="#ffffff" height="16" rx="3" width="24" />
          <rect fill="#1d4ed8" height="16" rx="3" width="8" />
          <rect fill="#e11d48" height="16" rx="3" width="8" x="16" />
        </FlagSvg>
      );
    case 'ES':
      return (
        <FlagSvg className={className}>
          <rect fill="#c81e2a" height="16" rx="3" width="24" />
          <rect fill="#ffcf4d" height="8" rx="2" width="24" y="4" />
        </FlagSvg>
      );
    case 'RU':
      return (
        <FlagSvg className={className}>
          <rect fill="#ffffff" height="5.4" rx="3" width="24" y="0" />
          <rect fill="#1d4ed8" height="5.4" rx="3" width="24" y="5.3" />
          <rect fill="#d81e06" height="5.4" rx="3" width="24" y="10.6" />
        </FlagSvg>
      );
    case 'BR':
      return (
        <FlagSvg className={className}>
          <rect fill="#1f9d55" height="16" rx="3" width="24" />
          <path d="M12 3.2 19.6 8 12 12.8 4.4 8 12 3.2Z" fill="#ffd84d" />
          <circle cx="12" cy="8" fill="#1e40af" r="2.7" />
        </FlagSvg>
      );
    case 'GB':
    case 'UK':
      return (
        <FlagSvg className={className}>
          <rect fill="#0f47af" height="16" rx="3" width="24" />
          <path d="M0 2.2 2 0l22 13.8V16h-2.1L0 2.2Z" fill="#ffffff" />
          <path d="M24 2.2 22 0 0 13.8V16h2.1L24 2.2Z" fill="#ffffff" />
          <path d="M9.4 0h5.2v16H9.4Z" fill="#ffffff" />
          <path d="M0 5.4h24v5.2H0Z" fill="#ffffff" />
          <path d="M10.4 0h3.2v16h-3.2Z" fill="#cf142b" />
          <path d="M0 6.4h24v3.2H0Z" fill="#cf142b" />
        </FlagSvg>
      );
    case 'NL':
      return (
        <FlagSvg className={className}>
          <rect fill="#ae1c28" height="5.4" rx="3" width="24" y="0" />
          <rect fill="#ffffff" height="5.4" rx="3" width="24" y="5.3" />
          <rect fill="#21468b" height="5.4" rx="3" width="24" y="10.6" />
        </FlagSvg>
      );
    case 'IT':
      return (
        <FlagSvg className={className}>
          <rect fill="#009246" height="16" rx="3" width="8" />
          <rect fill="#ffffff" height="16" rx="3" width="8" x="8" />
          <rect fill="#ce2b37" height="16" rx="3" width="8" x="16" />
        </FlagSvg>
      );
    case 'PL':
      return (
        <FlagSvg className={className}>
          <rect fill="#ffffff" height="8" rx="3" width="24" />
          <rect fill="#dc143c" height="8" rx="3" width="24" y="8" />
        </FlagSvg>
      );
    case 'CH':
      return (
        <FlagSvg className={className}>
          <rect fill="#d52b1e" height="16" rx="3" width="24" />
          <rect fill="#ffffff" height="9" width="3.4" x="10.3" y="3.5" />
          <rect fill="#ffffff" height="3.4" width="9" x="7.5" y="6.3" />
        </FlagSvg>
      );
    case 'TR':
      return (
        <FlagSvg className={className}>
          <rect fill="#e30a17" height="16" rx="3" width="24" />
          <circle cx="10.1" cy="8" fill="#ffffff" r="3.4" />
          <circle cx="11" cy="8" fill="#e30a17" r="2.7" />
          <path d="m14.7 8 1.7-1 0.1 2Z" fill="#ffffff" />
        </FlagSvg>
      );
    case 'IS':
      return (
        <FlagSvg className={className}>
          <rect fill="#02529c" height="16" rx="3" width="24" />
          <rect fill="#ffffff" height="16" width="4" x="7" />
          <rect fill="#ffffff" height="4" width="24" y="6" />
          <rect fill="#dc1e35" height="16" width="2" x="8" />
          <rect fill="#dc1e35" height="2" width="24" y="7" />
        </FlagSvg>
      );
    case 'SG':
      return (
        <FlagSvg className={className}>
          <rect fill="#ef3340" height="8" rx="3" width="24" />
          <rect fill="#ffffff" height="8" rx="3" width="24" y="8" />
          <circle cx="6" cy="4" fill="#ffffff" r="2.2" />
          <circle cx="6.7" cy="4" fill="#ef3340" r="1.8" />
        </FlagSvg>
      );
    default:
      return (
        <FlagSvg className={className}>
          <rect fill="#6fb4ff" height="16" rx="3" width="24" />
          <rect fill="#6cf2d1" height="8" rx="3" width="24" y="8" />
        </FlagSvg>
      );
  }
}

export function CountryFlagIcon({ countryCode, className }: Omit<FlagIconProps, 'locale'>) {
  return renderFlag(normalizeCountryCode(undefined, countryCode), className);
}

export function FlagIcon({ locale, countryCode, className }: FlagIconProps) {
  return renderFlag(normalizeCountryCode(locale, countryCode), className);
}
