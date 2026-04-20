import { useMemo, useState } from 'react';

type VisualIconTone = 'teal' | 'blue' | 'violet' | 'amber' | 'emerald' | 'slate';

type VisualIconProps = {
  src?: string | null;
  label: string;
  glyph: string;
  tone?: VisualIconTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

function isLikelyImageSource(src: string | null | undefined) {
  if (!src) {
    return false;
  }

  return /^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:image/');
}

export function VisualIcon({
  src = null,
  label,
  glyph,
  tone = 'slate',
  size = 'md',
  className,
}: VisualIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const canRenderImage = isLikelyImageSource(src) && !imageFailed;
  const composedClassName = useMemo(() => {
    const classes = ['visual-icon', `visual-icon--${tone}`, `visual-icon--${size}`];
    if (className) {
      classes.push(className);
    }
    return classes.join(' ');
  }, [className, size, tone]);

  return (
    <span aria-hidden="true" className={composedClassName} title={label}>
      {canRenderImage ? (
        <img
          alt=""
          className="visual-icon__image"
          src={src ?? undefined}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="visual-icon__glyph">{glyph}</span>
      )}
    </span>
  );
}
