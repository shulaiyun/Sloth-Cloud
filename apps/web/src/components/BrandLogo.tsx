import React from 'react';

type BrandLogoProps = {
  variant?: 'default' | 'hero';
};

export function BrandLogo({ variant = 'default' }: BrandLogoProps) {
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return (
    <span className={`brand-mark ${variant === 'hero' ? 'brand-mark--hero' : ''}`} aria-hidden="true">
      <img alt="" className="brand-mark__image" src={`${basePath}brand/sloth-cloud-logo.png`} />
    </span>
  );
}
