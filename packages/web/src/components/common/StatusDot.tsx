import type { CSSProperties } from 'react';
import styles from './StatusDot.module.css';

export interface StatusDotProps {
  readonly color: string;
  readonly size?: number | undefined;
  /** ขอบขาวรอบจุด (ใช้ในคำอธิบายสัญลักษณ์) */
  readonly ringed?: boolean | undefined;
  /** ชื่อ animation จาก keyframes.css เช่น "fsDotGlow 2.6s ease-in-out infinite" */
  readonly animation?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

export function StatusDot({ color, size = 10, ringed = false, animation, style }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="status-dot"
      className={[styles.dot, ringed ? styles.ringed : null].filter(Boolean).join(' ')}
      style={{
        width: size,
        height: size,
        background: color,
        ...(animation ? { animation } : {}),
        ...style,
      }}
    />
  );
}
