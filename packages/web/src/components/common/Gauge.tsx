import type { CssVars } from '@/lib/cssVars';
import styles from './Gauge.module.css';

export interface GaugeProps {
  /** มุมของ arc เช่น "212.4deg" */
  readonly deg: string;
  /** สีของ arc (ปกติเป็น token var(--st-*)) */
  readonly color: string;
  /** ขนาดวง — ค่า CSS ใดก็ได้ ต้นแบบใช้ clamp(26px, 3.4vh, 34px) */
  readonly size?: string | undefined;
  readonly title?: string | undefined;
}

export function Gauge({ deg, color, size = 'clamp(26px, 3.4vh, 34px)', title }: GaugeProps) {
  const style: CssVars = { width: size, height: size, '--fs-deg': deg, '--fs-rc': color };
  return (
    <div
      className={styles.ring}
      style={style}
      role="img"
      aria-label={title}
      data-deg={deg}
      data-testid="gauge"
    >
      <div className={styles.face} />
    </div>
  );
}
