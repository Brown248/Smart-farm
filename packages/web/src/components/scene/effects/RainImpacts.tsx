import type { CSSProperties } from 'react';
import { IMPACTS } from '@/lib/particles';
import s from './effects.module.css';

export interface RainImpactsProps {
  readonly show: boolean;
}

type ImpactVars = CSSProperties & { '--impact-peak': string };

const impactStyle = (p: (typeof IMPACTS)[number]): ImpactVars => ({
  left: p.left,
  top: p.top,
  width: p.size,
  animation: `fsImpact ${p.dur} ease-out ${p.delay} infinite`,
  '--impact-peak': p.peak,
});

/**
 * เม็ดฝนกระทบหลังคากระจก — วงกระเพื่อมเล็กๆ ผุดขึ้นแล้วจางหาย
 * อยู่ในแถบบน 6–40% ซึ่งเป็นช่วงกระจกในภาพ (แถบเดียวกับที่ mask ม่านฝนไว้)
 * ตำแหน่งมาจาก `makeParticles` จึงอยู่ที่เดิมทุกครั้ง ไม่กระตุกตอน re-render
 *
 * รับ `show` แยกจาก `raining` เพราะต้องดับสนิทเมื่อผู้ใช้ตั้ง reduced-motion —
 * ถ้าปล่อยให้ CSS หยุด animation เฉยๆ วงจะค้างกลางจอเป็นจุดขาว
 */
export function RainImpacts({ show }: RainImpactsProps) {
  if (!show) return null;

  return (
    <>
      {IMPACTS.map((p) => (
        <span
          key={`impact-${p.left}-${p.top}`}
          aria-hidden="true"
          data-effect="impact"
          className={s.impact}
          style={impactStyle(p)}
        />
      ))}
    </>
  );
}
