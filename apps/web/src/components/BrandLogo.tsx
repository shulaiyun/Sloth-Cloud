import { useId } from 'react';

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  const suffix = useId().replace(/:/g, '');
  const glowId = `sloth-cloud-glow-${suffix}`;
  const bodyId = `sloth-cloud-body-${suffix}`;
  const faceId = `sloth-cloud-face-${suffix}`;
  const lineId = `sloth-cloud-line-${suffix}`;
  const dotId = `sloth-cloud-dot-${suffix}`;
  const clipId = `sloth-cloud-clip-${suffix}`;
  const haloId = `sloth-cloud-halo-${suffix}`;
  const mistId = `sloth-cloud-mist-${suffix}`;

  const bodyPath =
    'M23.6 54.1c0-10.1 4.5-18.3 12.2-23.5 5.5-3.7 12.2-5.8 19.6-5.8 10.8 0 20.3 4.7 26.5 12.4 5.2 6.4 8 14.3 8 22.5 0 9.2-3.6 17.3-10.4 23.2-6.2 5.3-14.7 8.2-24 8.2-12 0-22.8-4.8-29.6-13.4-1.8-2.2-2.6-4.7-2.6-7.4v-16.2Z';

  const facePath =
    'M31.4 40.5c2.2-8.5 9.2-14.7 18-16 9.3-1.3 18.7 2.9 24 10.7 2.4 3.5 3.8 7.6 4.1 11.9-4.1 3.6-8.9 5.5-14.2 5.5-4.7 0-8.9-1.6-12-4.6-3.1 3.2-7.3 4.8-12.1 4.8-5.2 0-9.9-1.8-14-5.2-.5-2.4-.3-4.6.2-7.1Z';
  const rightSpirePath =
    'M77.6 22.8c4.7 5.8 7.9 12.6 9.6 20.5 1.4 6.2 1.6 12.3.5 18.2l4.9 3.2c-4.3 2.2-8.9 3.2-13.6 2.9-1 4.1-2.8 7.6-5.4 10.5-2.8-4.5-4.7-9.2-5.8-14.2-1.6-7.6-1.6-15.7.1-24.2 1.9-9.4 5.5-16.7 9.7-17.9Z';
  const legFrontPath = 'M31.4 67.3c-2.5 6.4-4.7 11.2-6.8 14.8-1 1.7-1 3.7.1 5.2 1.8 2.4 5.4 2.1 6.7-.6 2.7-5.4 4.9-10.6 6.8-15.9-1.8-1.9-3.7-3.7-6.8-3.5Z';
  const legMiddlePath = 'M48.8 70c-1.3 7.6-2 13.2-2.3 17.8-.1 1.9.9 3.6 2.5 4.4 2.4 1.2 5.2-.1 5.9-2.7 1.6-5.8 2.8-11.6 3.8-17.4-2.1-1.4-4.3-2.5-5.8-2.5-1.2 0-2.7.2-4.1.4Z';
  const legRearPath = 'M63.8 68.2c.7 7.8 1.2 13.8 1.4 18 .1 2.1 1.7 3.8 3.9 4 2.8.2 5.1-2 5.1-4.8 0-5.9-.5-11.7-1.3-17.4-2.4-.3-5.2-.2-9.1.2Z';

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 96 96"
    >
      <defs>
        <radialGradient id={glowId} cx="34%" cy="27%" r="62%">
          <stop offset="0%" stopColor="#d9fff8" stopOpacity="0.6" />
          <stop offset="45%" stopColor="#b6f1ff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#b6f1ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={haloId} cx="47%" cy="44%" r="56%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.44" />
          <stop offset="62%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={mistId} x1="20" x2="74" y1="16" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f8fdff" />
          <stop offset="100%" stopColor="#d8edf8" />
        </linearGradient>
        <linearGradient id={bodyId} x1="22" x2="72" y1="24" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#081126" />
          <stop offset="52%" stopColor="#09142a" />
          <stop offset="100%" stopColor="#030814" />
        </linearGradient>
        <linearGradient id={faceId} x1="28" x2="60" y1="26" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbfeff" />
          <stop offset="100%" stopColor="#e9f4fb" />
        </linearGradient>
        <linearGradient id={lineId} x1="18" x2="78" y1="24" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c5fff5" />
          <stop offset="44%" stopColor="#86e8ff" />
          <stop offset="100%" stopColor="#d7a2ff" />
        </linearGradient>
        <radialGradient id={dotId} cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#fcffff" />
          <stop offset="100%" stopColor="#8de2ff" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <circle cx="42" cy="44" fill={`url(#${haloId})`} r="27" />
      <circle cx="46" cy="44" fill={`url(#${glowId})`} r="30" />
      <circle cx="46" cy="48" fill={`url(#${mistId})`} opacity="0.26" r="33" />
      <circle cx="64" cy="34" fill="#07111d" opacity="0.22" r="15" />
      <path
        d="M20.4 47.9c1.8-6.1 4.8-10.8 9.2-14.3"
        fill="none"
        opacity="0.62"
        stroke="#f7fdff"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M27.8 37.6c2.3-8.2 7.7-14.3 15.4-17.4"
        fill="none"
        opacity="0.45"
        stroke="#dff9ff"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M37.2 32.4c3.4-5.1 8.1-8.2 14.1-9.3"
        fill="none"
        opacity="0.36"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M48.8 29.8c3-3.9 6.8-6.3 11.4-7.1"
        fill="none"
        opacity="0.34"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
      <circle cx="24.2" cy="34.8" fill={`url(#${dotId})`} r="1.9" />
      <circle cx="31.8" cy="28.6" fill={`url(#${dotId})`} r="1.6" />
      <circle cx="42.2" cy="23.2" fill={`url(#${dotId})`} r="1.5" />
      <circle cx="53.4" cy="21.2" fill={`url(#${dotId})`} r="1.4" />
      <circle cx="62.8" cy="24.8" fill={`url(#${dotId})`} r="1.5" />

      <path d={rightSpirePath} fill={`url(#${bodyId})`} opacity="0.92" />
      <path d={bodyPath} fill={`url(#${bodyId})`} />
      <path d={bodyPath} fill="none" opacity="0.88" stroke={`url(#${lineId})`} strokeWidth="1.6" />

      <g clipPath={`url(#${clipId})`}>
        <path
          d="M27.4 43.5 37 39.8 46 43.4 55.4 38.2 64.2 41.1 71 36.6"
          fill="none"
          opacity="0.68"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
        <path
          d="M24.8 56.8 35.3 52.2 45.2 56.8 55.9 51.3 66.8 55.6 73.4 53.2"
          fill="none"
          opacity="0.74"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M29.2 66.6 39 62.4 49.3 66 60.2 60.7 69.1 63.4"
          fill="none"
          opacity="0.6"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <path
          d="M32.7 49.9 42 45.8 52.2 49.3 61.8 43.6 69.6 46.1"
          fill="none"
          opacity="0.52"
          stroke={`url(#${lineId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
        <circle cx="37.2" cy="43.8" fill={`url(#${dotId})`} r="2.2" />
        <circle cx="45.6" cy="48.2" fill={`url(#${dotId})`} r="2.3" />
        <circle cx="55.2" cy="42.6" fill={`url(#${dotId})`} r="2.2" />
        <circle cx="63.8" cy="47" fill={`url(#${dotId})`} r="2.1" />
        <circle cx="73.4" cy="53.2" fill={`url(#${dotId})`} r="1.9" />
        <circle cx="39.1" cy="62.3" fill={`url(#${dotId})`} r="2" />
        <circle cx="49.6" cy="66.8" fill={`url(#${dotId})`} r="2.2" />
        <circle cx="60.8" cy="61.8" fill={`url(#${dotId})`} r="2.2" />
        <circle cx="69.2" cy="64.2" fill={`url(#${dotId})`} r="1.9" />
      </g>

      <path d={facePath} fill={`url(#${faceId})`} />
      <circle cx="36.6" cy="39.7" fill="#09111d" r="3.4" />
      <circle cx="52.6" cy="39.7" fill="#09111d" r="3.4" />
      <circle cx="44.8" cy="44.8" fill="#09111d" r="2.1" />
      <path
        d="M37.4 48c2.3 1.8 4.8 2.7 7.4 2.7 2.8 0 5.4-.9 7.8-2.7"
        fill="none"
        stroke="#09111d"
        strokeLinecap="round"
        strokeWidth="2.3"
      />

      <path d={legFrontPath} fill={`url(#${bodyId})`} />
      <path d={legMiddlePath} fill={`url(#${bodyId})`} />
      <path d={legRearPath} fill={`url(#${bodyId})`} />

      <path
        d="M22.3 63.4c-.4-7.4 1.7-13.6 6.2-18.5"
        fill="none"
        opacity="0.52"
        stroke="#f5fffd"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <path
        d="M70.1 61.2c4.4 3.5 7.6 7.8 9.7 13"
        fill="none"
        opacity="0.34"
        stroke="#f5fffd"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
