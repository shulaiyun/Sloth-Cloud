import { useId } from 'react';

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  const suffix = useId().replace(/:/g, '');
  const bgId = `sloth-cloud-bg-${suffix}`;
  const glowId = `sloth-cloud-glow-${suffix}`;
  const bodyId = `sloth-cloud-body-${suffix}`;
  const faceId = `sloth-cloud-face-${suffix}`;
  const lineId = `sloth-cloud-line-${suffix}`;
  const dotId = `sloth-cloud-dot-${suffix}`;
  const clipId = `sloth-cloud-clip-${suffix}`;

  const bodyPath =
    'M22.5 48.5c0-10.6 8.5-19.3 19.1-19.3h9.4c14.2 0 25.8 11.5 25.8 25.8 0 13.9-11 25.1-24.6 25.1H38.8c-9 0-16.3-7.3-16.3-16.3v-15.3Z';

  const facePath =
    'M31 38.6c2.5-8.1 10.1-13.8 18.9-13.8 10.7 0 19.5 7.6 21.2 17.7-1.8 1.7-3.9 3.1-6.2 4.1-2.2 1-4.7 1.5-7.3 1.5-4.8 0-9.2-1.9-12.3-5.1-3.2 3-7.4 4.8-12 4.8-2.6 0-5-.5-7.2-1.4-.7-2.5-.7-5.1-.1-7.8Z';

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 96 96"
    >
      <defs>
        <linearGradient id={bgId} x1="12" x2="84" y1="8" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0cf0dd" />
          <stop offset="40%" stopColor="#64b5ff" />
          <stop offset="100%" stopColor="#6f54ff" />
        </linearGradient>
        <radialGradient id={glowId} cx="28%" cy="24%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="58%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={bodyId} x1="22" x2="72" y1="24" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#091021" />
          <stop offset="55%" stopColor="#0a1323" />
          <stop offset="100%" stopColor="#050b17" />
        </linearGradient>
        <linearGradient id={faceId} x1="28" x2="56" y1="24" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f7fcff" />
          <stop offset="100%" stopColor="#dff1ff" />
        </linearGradient>
        <linearGradient id={lineId} x1="22" x2="74" y1="28" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#aefdf0" />
          <stop offset="50%" stopColor="#9dd4ff" />
          <stop offset="100%" stopColor="#d39cff" />
        </linearGradient>
        <radialGradient id={dotId} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="48%" stopColor="#f5fffd" />
          <stop offset="100%" stopColor="#89d8ff" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <rect fill={`url(#${bgId})`} height="96" rx="28" width="96" />
      <rect fill={`url(#${glowId})`} height="96" rx="28" width="96" />

      <circle cx="68" cy="30" fill="#07111f" opacity="0.38" r="18" />
      <path
        d="M24 24c3.2-4.2 6.7-7 10.6-8.3"
        fill="none"
        opacity="0.58"
        stroke="#f0f9ff"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M31.2 19.2c0-6 3.2-10.7 8.1-13.3"
        fill="none"
        opacity="0.42"
        stroke="#e6fbff"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M41.4 16.3c2.4-4 5.5-6.1 9.3-6.5"
        fill="none"
        opacity="0.32"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <circle cx="29" cy="17.2" fill={`url(#${dotId})`} r="1.9" />
      <circle cx="36.6" cy="12.6" fill={`url(#${dotId})`} r="1.6" />
      <circle cx="46.2" cy="10.6" fill={`url(#${dotId})`} r="1.5" />

      <path d={bodyPath} fill={`url(#${bodyId})`} />
      <path d={bodyPath} fill="none" opacity="0.9" stroke={`url(#${lineId})`} strokeWidth="1.7" />

      <g clipPath={`url(#${clipId})`}>
        <path
          d="M23.8 56.5 35 51.8 46.4 56.9 58.4 50.1 68.6 55.1"
          fill="none"
          opacity="0.7"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="M29.8 64.6 38.7 60.2 49.8 64.4 62.4 58.5 73.4 61.1"
          fill="none"
          opacity="0.55"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
        <path
          d="M34 44.4 44.8 39.8 55.8 43.2 66.4 36.4"
          fill="none"
          opacity="0.52"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
        <circle cx="35.2" cy="51.8" fill={`url(#${dotId})`} r="2.2" />
        <circle cx="46.4" cy="56.9" fill={`url(#${dotId})`} r="2.5" />
        <circle cx="58.4" cy="50.1" fill={`url(#${dotId})`} r="2.3" />
        <circle cx="68.6" cy="55.1" fill={`url(#${dotId})`} r="2" />
        <circle cx="38.7" cy="60.2" fill={`url(#${dotId})`} r="1.9" />
        <circle cx="49.8" cy="64.4" fill={`url(#${dotId})`} r="2.1" />
        <circle cx="62.4" cy="58.5" fill={`url(#${dotId})`} r="2.3" />
        <circle cx="44.8" cy="39.8" fill={`url(#${dotId})`} r="1.8" />
        <circle cx="55.8" cy="43.2" fill={`url(#${dotId})`} r="2.1" />
        <circle cx="66.4" cy="36.4" fill={`url(#${dotId})`} r="1.8" />
      </g>

      <path d={facePath} fill={`url(#${faceId})`} />
      <circle cx="37.9" cy="39.8" fill="#08101d" r="3.3" />
      <circle cx="53.2" cy="39.8" fill="#08101d" r="3.3" />
      <circle cx="45.6" cy="44.5" fill="#08101d" r="2" />
      <path
        d="M38 47.8c2.1 1.6 4.3 2.4 6.7 2.4 2.6 0 5-.8 7.4-2.5"
        fill="none"
        stroke="#08101d"
        strokeLinecap="round"
        strokeWidth="2.2"
      />

      <path
        d="M22.8 60.4c0-7.1 2.3-12.9 6.8-17.5"
        fill="none"
        opacity="0.45"
        stroke="#f5fffd"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M69.4 60.4c4.6 3.5 8 7.8 10.1 12.9"
        fill="none"
        opacity="0.32"
        stroke="#f5fffd"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
