import React from 'react';

type VisualIconTone = 'teal' | 'blue' | 'violet' | 'amber' | 'emerald' | 'slate';
type VisualIconSize = 'sm' | 'md' | 'lg';

type VisualIconProps = {
  glyph?: string | null;
  label?: string | null;
  size?: VisualIconSize;
  src?: string | null;
  tone?: VisualIconTone;
};

export function VisualIcon({
  glyph,
  label,
  size = 'md',
  src = null,
  tone = 'teal',
}: VisualIconProps) {
  const title = (label ?? '').trim();

  return (
    <span className={`visual-icon visual-icon--${size} visual-icon--${tone}`} title={title || undefined}>
      {src ? (
        <img alt={title || 'icon'} className="visual-icon__image" loading="lazy" src={src} />
      ) : (
        <span aria-hidden="true" className="visual-icon__glyph">
          {glyph || '◉'}
        </span>
      )}
    </span>
  );
}
