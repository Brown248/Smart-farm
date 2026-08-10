import { clamp } from '@/lib/format';
import s from './chart.module.css';

export interface RingGaugeProps {
  /** 0–100 */
  readonly percent: number;
  readonly color: string;
}

/** วงแหวนเปอร์เซ็นต์พร้อมตัวเลขตรงกลาง ในการ์ดเซนเซอร์ */
export function RingGauge({ percent, color }: RingGaugeProps) {
  const R = 25;
  const C = 2 * Math.PI * R;
  const v = clamp(percent, 0, 100);

  return (
    <svg width={62} height={62} viewBox="0 0 62 62" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx={31} cy={31} r={R} fill="none" stroke="#e7ece7" strokeWidth={7} />
      <circle
        cx={31}
        cy={31}
        r={R}
        fill="none"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - v / 100)}
        transform="rotate(-90 31 31)"
        style={{ stroke: color, transition: 'stroke-dashoffset .7s cubic-bezier(.2,.9,.3,1)' }}
      />
      <text x={31} y={36} textAnchor="middle" className={s.gaugeText}>
        {Math.round(v)}%
      </text>
    </svg>
  );
}
