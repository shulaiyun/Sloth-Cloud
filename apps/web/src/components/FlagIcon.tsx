import React from 'react';

function countryCodeToEmoji(code: string) {
  const normalized = (code || 'UN').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return '🏳️';
  }

  const base = 0x1f1e6;
  const first = normalized.charCodeAt(0) - 65;
  const second = normalized.charCodeAt(1) - 65;
  return String.fromCodePoint(base + first, base + second);
}

type CountryFlagIconProps = {
  countryCode: string;
  className?: string;
};

export function CountryFlagIcon({ countryCode, className }: CountryFlagIconProps) {
  const normalized = (countryCode || 'UN').toUpperCase();
  const emoji = countryCodeToEmoji(normalized);
  return (
    <span
      aria-label={normalized}
      className={`flag-icon ${className ?? ''}`.trim()}
      role="img"
      title={normalized}
    >
      <span className="flag-icon__emoji">{emoji}</span>
    </span>
  );
}
