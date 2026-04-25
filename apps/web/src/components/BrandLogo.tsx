import React from 'react';

type BrandLogoProps = {
  variant?: 'default' | 'hero';
};

export function BrandLogo({ variant = 'default' }: BrandLogoProps) {
  return (
    <span className={`brand-mark ${variant === 'hero' ? 'brand-mark--hero' : ''}`} aria-hidden="true">
      <img alt="" className="brand-mark__image" src="/brand/sloth-cloud-logo.png" />
    </span>
  );
}
