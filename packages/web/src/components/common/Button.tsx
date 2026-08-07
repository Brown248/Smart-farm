import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'wood' | 'primary' | 'ghost' | 'outline' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant | undefined;
  /** กำลังรอผลคำสั่ง — แสดงสปินเนอร์และกดซ้ำไม่ได้ */
  readonly pending?: boolean | undefined;
  readonly pill?: boolean | undefined;
  readonly block?: boolean | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

export function Button({
  variant = 'ghost',
  pending = false,
  pill = false,
  block = false,
  disabled = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.base,
    styles[variant],
    pill ? styles.pill : null,
    block ? styles.block : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
