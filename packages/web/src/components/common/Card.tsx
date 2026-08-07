import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardVariant = 'plain' | 'cream' | 'hud' | 'metric';

export interface CardProps {
  readonly variant?: CardVariant | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children?: ReactNode;
}

const VARIANT_CLASS: Record<CardVariant, string | undefined> = {
  plain: undefined,
  cream: styles.cream,
  hud: styles.hud,
  metric: styles.metric,
};

export function Card({ variant = 'plain', className, style, children }: CardProps) {
  const classes = [styles.card, VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
