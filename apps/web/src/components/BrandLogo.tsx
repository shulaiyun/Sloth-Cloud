import { useId } from 'react';

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  const suffix = useId().replace(/:/g, '');
  const bgId = `sloth-cloud-bg-${suffix}`;
  const glowId = `sloth-cloud-glow-${suffix}`;
  const ringId = `sloth-cloud-ring-${suffix}`;

  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 88 88">
      <defs>
        <linearGradient id={bgId} x1="12" x2="76" y1="8" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7bf8de" />
          <stop offset="54%" stopColor="#67b3ff" />
          <stop offset="100%" stopColor="#7b6cff" />
        </linearGradient>
        <radialGradient id={glowId} cx="28%" cy="20%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ringId} x1="22" x2="66" y1="24" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5fffd" />
          <stop offset="100%" stopColor="#d8f3ff" />
        </linearGradient>
      </defs>

      <rect fill={`url(#${bgId})`} height="88" rx="26" width="88" />
      <rect fill={`url(#${glowId})`} height="88" rx="26" width="88" />

      <path
        d="M22 52c0-12.8 10.4-23.2 23.2-23.2 4.7 0 9.1 1.4 12.8 3.9 2.1-1.3 4.6-2 7.3-2 7.8 0 14.1 6.3 14.1 14.1 0 7.8-6.3 14.1-14.1 14.1H40.6C28.7 58.9 22 56 22 52Z"
        fill="#06131f"
        opacity="0.88"
      />
      <path
        d="M27 45.6c0-9.8 7.9-17.7 17.7-17.7 4.3 0 8.2 1.5 11.3 4 3.1-2.5 7.1-4 11.5-4 9.1 0 16.5 7.4 16.5 16.5S66.6 60.9 57.5 60.9H43.8c-9.3 0-16.8-6.6-16.8-15.3Z"
        fill="none"
        opacity="0.98"
        stroke={`url(#${ringId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <path
        d="M32.6 27.7c4-4 8.6-6.4 13.9-7.1"
        fill="none"
        opacity="0.68"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <circle cx="39.4" cy="41.8" fill="#04111b" r="2.8" />
      <circle cx="51.1" cy="41.8" fill="#04111b" r="2.8" />
      <path
        d="M39.1 49.4c2.1 2 4.4 3 6.9 3 2.6 0 5-1 7.2-3.1"
        fill="none"
        stroke="#04111b"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <path
        d="M18.5 61.2h15.3"
        fill="none"
        opacity="0.48"
        stroke="#effdff"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}
