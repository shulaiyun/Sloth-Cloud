import { useId } from 'react';

type BrandLogoProps = {
  className?: string;
  variant?: 'default' | 'hero' | 'mono';
  withGlow?: boolean;
};

export function BrandLogo({
  className,
  variant = 'default',
  withGlow = true,
}: BrandLogoProps) {
  const suffix = useId().replace(/:/g, '');
  const frameId = `brand-frame-${suffix}`;
  const coreId = `brand-core-${suffix}`;
  const haloId = `brand-halo-${suffix}`;
  const accentId = `brand-accent-${suffix}`;
  const strokeId = `brand-stroke-${suffix}`;
  const nodeId = `brand-node-${suffix}`;
  const clipId = `brand-clip-${suffix}`;

  const isMono = variant === 'mono';
  const nodeColor = isMono ? '#cfe5f2' : `url(#${nodeId})`;
  const orbitStroke = isMono ? '#d6edf7' : `url(#${strokeId})`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 96 96"
    >
      <defs>
        <linearGradient id={frameId} x1="14" x2="84" y1="10" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isMono ? '#122336' : '#68f0de'} />
          <stop offset="52%" stopColor={isMono ? '#1a2b3d' : '#6db2ff'} />
          <stop offset="100%" stopColor={isMono ? '#0c1624' : '#6d59f5'} />
        </linearGradient>
        <linearGradient id={coreId} x1="26" x2="72" y1="22" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isMono ? '#18283a' : '#091729'} />
          <stop offset="100%" stopColor={isMono ? '#0f1a28' : '#06101d'} />
        </linearGradient>
        <radialGradient id={haloId} cx="34%" cy="24%" r="68%">
          <stop offset="0%" stopColor={isMono ? '#dcebf5' : '#e9fffa'} stopOpacity="0.86" />
          <stop offset="42%" stopColor={isMono ? '#bfd6e4' : '#8beeff'} stopOpacity="0.28" />
          <stop offset="100%" stopColor={isMono ? '#b6ccda' : '#6d59f5'} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={accentId} x1="34" x2="66" y1="25" y2="77" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={isMono ? '#e5eff7' : '#d7f7ff'} />
        </linearGradient>
        <linearGradient id={strokeId} x1="24" x2="74" y1="24" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isMono ? '#e5f1f7' : '#77f6df'} />
          <stop offset="56%" stopColor={isMono ? '#d8e7f1' : '#7bc0ff'} />
          <stop offset="100%" stopColor={isMono ? '#c2d6e5' : '#b79aff'} />
        </linearGradient>
        <radialGradient id={nodeId} cx="48%" cy="42%" r="68%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={isMono ? '#d4e3ef' : '#9fe8ff'} />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="49" cy="50" r="27" />
        </clipPath>
      </defs>

      <rect
        x="6"
        y="6"
        width="84"
        height="84"
        rx="26"
        fill={isMono ? '#0f1723' : `url(#${coreId})`}
        stroke={`url(#${frameId})`}
        strokeWidth="1.6"
      />
      {withGlow ? <ellipse cx="40" cy="24" fill={`url(#${haloId})`} rx="26" ry="18" /> : null}
      <circle
        cx="49"
        cy="50"
        r="27"
        fill={isMono ? '#101b28' : 'rgba(7, 19, 31, 0.9)'}
        stroke={orbitStroke}
        strokeOpacity="0.86"
        strokeWidth="1.4"
      />
      <circle
        cx="49"
        cy="50"
        r="21.5"
        fill="none"
        opacity="0.32"
        stroke={orbitStroke}
        strokeDasharray="2.6 5.4"
        strokeLinecap="round"
      />

      <g clipPath={`url(#${clipId})`}>
        <path
          d="M25 28.5 38.6 20.8 52.2 24.5 66.2 17.4"
          fill="none"
          opacity="0.78"
          stroke={orbitStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
        <path
          d="M28.4 39.6 40.2 33.3 51.5 36.5 63.3 30.4 72.3 34.5"
          fill="none"
          opacity="0.72"
          stroke={orbitStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <path
          d="M26.7 57.1 37.8 49.7 49.6 54.3 60.5 45.8 72.1 49.9"
          fill="none"
          opacity="0.7"
          stroke={orbitStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
        <path
          d="M29.8 70.3 40.9 62.3 53 66.8 64.1 58.8 73.3 63.5"
          fill="none"
          opacity="0.66"
          stroke={orbitStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
        <circle cx="38.7" cy="20.8" fill={nodeColor} r="1.9" />
        <circle cx="52.2" cy="24.5" fill={nodeColor} r="1.8" />
        <circle cx="66.2" cy="17.4" fill={nodeColor} r="1.8" />
        <circle cx="40.2" cy="33.3" fill={nodeColor} r="1.9" />
        <circle cx="51.5" cy="36.5" fill={nodeColor} r="2.1" />
        <circle cx="63.3" cy="30.4" fill={nodeColor} r="1.9" />
        <circle cx="37.8" cy="49.7" fill={nodeColor} r="2.1" />
        <circle cx="49.6" cy="54.3" fill={nodeColor} r="2.2" />
        <circle cx="60.5" cy="45.8" fill={nodeColor} r="2.1" />
        <circle cx="64.1" cy="58.8" fill={nodeColor} r="2" />
      </g>

      <path
        d="M32.4 56.1c0-12.6 8.8-21.8 21-21.8 10.1 0 18.6 6.3 21.1 15.9 2.1 8.2-.2 16.2-6 21.4-4.7 4.1-11 6.3-17.8 6.3-10.7 0-18.3-3.9-23.1-11.8-1.1-1.8-1.7-3.7-1.7-5.9v-4.1Z"
        fill={isMono ? '#09111c' : '#08121e'}
        opacity="0.96"
        stroke={orbitStroke}
        strokeOpacity="0.4"
        strokeWidth="1"
      />
      <path
        d="M33.8 45.5c1.7-7.6 8.4-13.1 16.4-13.7 8.1-.7 15.9 3.6 19.9 10.9.9 1.6 1.5 3.4 1.8 5.2-3.3 2.7-7.1 4.1-11.5 4.1-3.8 0-7.2-1.1-9.9-3.4-2.8 2.5-6.2 3.7-10 3.7-4.1 0-7.7-1.2-10.9-3.8-.3-1-.3-2 0-3Z"
        fill={`url(#${accentId})`}
      />
      <path
        d="M39.2 45.1c.8-2.7 2.5-4.7 4.8-5.8 1.8-.9 4.1-.9 5.8.2-1.6 2.9-4.2 4.7-7.7 5.6l-2.9.7Z"
        fill={isMono ? '#121d2a' : '#0b1623'}
      />
      <path
        d="M56.9 39.5c1.7-1.1 4-.9 5.8-.1 2.3 1.1 4 3.1 4.8 5.8l-3-.7c-3.3-.8-5.8-2.6-7.6-5Z"
        fill={isMono ? '#121d2a' : '#0b1623'}
      />
      <circle cx="50.1" cy="46.2" fill={isMono ? '#121c29' : '#08111b'} r="1.7" />
      <path
        d="M45.6 49.3c1.4 1.5 3 2.2 4.8 2.2 1.8 0 3.5-.7 4.9-2.2"
        fill="none"
        stroke={isMono ? '#121c29' : '#08111b'}
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M34.1 61.2c4.6 5.1 10 7.9 16.2 8.4 7 .7 13.4-1.4 19.1-6.2"
        fill="none"
        opacity="0.9"
        stroke={orbitStroke}
        strokeLinecap="round"
        strokeWidth="1.45"
      />
      <path
        d="M30.9 30.5c2.9-6.4 7.6-10.7 14.1-12.8"
        fill="none"
        opacity="0.86"
        stroke={orbitStroke}
        strokeLinecap="round"
        strokeWidth="1.35"
      />
      <path
        d="M32.8 25.2v-4.6M38.4 22.7l-1.3-4.1M44.8 20.9l-.4-4.5M51.2 20.8l.5-4.4M57.4 22.8l1.5-4.1M63.2 25.8l2.2-3.6"
        fill="none"
        opacity="0.78"
        stroke={orbitStroke}
        strokeLinecap="round"
        strokeWidth="1.2"
      />
      <circle cx="32.8" cy="20.6" fill={nodeColor} r="1.5" />
      <circle cx="38.4" cy="18.6" fill={nodeColor} r="1.4" />
      <circle cx="44.4" cy="16.4" fill={nodeColor} r="1.35" />
      <circle cx="51.7" cy="16.4" fill={nodeColor} r="1.35" />
      <circle cx="58.9" cy="18.7" fill={nodeColor} r="1.4" />
      <circle cx="65.4" cy="22.2" fill={nodeColor} r="1.45" />
    </svg>
  );
}
