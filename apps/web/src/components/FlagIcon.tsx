type FlagIconProps = {
  locale: string;
};

const flags: Record<string, string> = {
  'zh-CN': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#DE2910"/><polygon points="15,9 17.8,17 26.2,17 19.4,21.9 22,30 15,24.8 8,30 10.6,21.9 3.8,17 12.2,17" fill="#FFDE00"/></svg>`,
  'zh-TW': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#FE0000"/><rect width="28" height="22" rx="6" fill="#000095"/><circle cx="14" cy="11" r="5.2" fill="#fff"/></svg>`,
  'en-US': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#fff"/><path d="M0 0h64v4H0zm0 8h64v4H0zm0 8h64v4H0zm0 8h64v4H0zm0 8h64v4H0zm0 8h64v4H0z" fill="#B22234"/><rect width="28" height="20" rx="6" fill="#3C3B6E"/></svg>`,
  'de-DE': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#FFCE00"/><path d="M0 0h64v16H0z" fill="#000"/><path d="M0 16h64v16H0z" fill="#DD0000"/></svg>`,
  'fr-FR': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#ED2939"/><rect width="42.7" height="48" fill="#fff"/><rect width="21.3" height="48" fill="#002395"/></svg>`,
  'es-ES': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#AA151B"/><rect y="12" width="64" height="24" fill="#F1BF00"/></svg>`,
  'ko-KR': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="8" fill="#fff"/><g fill="#111"><rect x="10" y="9" width="9" height="1.8" rx=".9"/><rect x="10" y="12" width="9" height="1.8" rx=".9"/><rect x="10" y="15" width="9" height="1.8" rx=".9"/><rect x="45" y="31" width="9" height="1.8" rx=".9"/><rect x="45" y="34" width="9" height="1.8" rx=".9"/><rect x="45" y="37" width="9" height="1.8" rx=".9"/><rect x="45" y="9" width="9" height="1.8" rx=".9"/><rect x="45" y="13" width="9" height="1.8" rx=".9"/><rect x="10" y="31" width="9" height="1.8" rx=".9"/><rect x="10" y="35" width="9" height="1.8" rx=".9"/></g><path d="M24 24a8 8 0 1 1 16 0 8 8 0 0 0-16 0z" fill="#CD2E3A"/><path d="M40 24a8 8 0 1 1-16 0 8 8 0 0 0 16 0z" fill="#0047A0"/></svg>`,
};

function toDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function FlagIcon({ locale }: FlagIconProps) {
  const svg = flags[locale] ?? flags['en-US'];

  return (
    <img
      alt=""
      aria-hidden="true"
      className="flag-icon"
      src={toDataUri(svg)}
    />
  );
}
