import React from 'react';
import logo from '../assets/logo-transparent.png';

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
  // To make the dark blue sloth visible on a dark background, 
  // we add a soft premium backlight directly behind it, 
  // and a tight glowing outline around the transparent PNG.
  return (
    <div 
      className={className} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      {/* 柔软的“环境背光”，在深色模式下照亮由于本身暗色而看不清的树懒，浅色模式下几乎不可见 */}
      <div 
        style={{
          position: 'absolute',
          width: '85%',
          height: '85%',
          background: 'radial-gradient(circle, rgba(230, 248, 255, 0.55) 0%, transparent 68%)',
          zIndex: 0,
          filter: 'blur(8px)',
          borderRadius: '50%'
        }}
      />
      <img 
        src={logo} 
        alt="Sloth Cloud Brand Logo" 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'contain', 
          display: 'block',
          position: 'relative',
          zIndex: 1,
          transform: 'scale(1.3)',
          // 紧贴图案边缘的白色+青蓝色光晕，完美提亮暗色图案的边缘！
          filter: 'brightness(1.1) drop-shadow(0 0 3px rgba(255, 255, 255, 0.8)) drop-shadow(0 4px 16px rgba(122, 246, 221, 0.5))'
        }} 
      />
    </div>
  );
}
