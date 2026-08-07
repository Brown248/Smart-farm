import type { CSSProperties } from 'react';
import type { Drip } from '@/lib/particles';
import s from './effects.module.css';

export interface GlassDropsProps {
  readonly drips: readonly Drip[];
}

/** custom property ที่ `fsDrip` กับ `.drip` อ่านไปใช้ — คุมความยาว/ความหนา/การส่ายรายสาย */
type DripVars = CSSProperties & {
  '--drip-len': string;
  '--drip-w': string;
  '--drip-drift': string;
  '--drip-fall': string;
};

/**
 * หยดน้ำไหลลงบนกระจก — เริ่มที่ 2% จากขอบบน (ช่วงที่เป็นหลังคากระจกในภาพ)
 * จึงไม่มีหยดน้ำโผล่กลางแปลงผัก
 * แต่ละสายมีหัวหยดกลมๆ นำหน้าและส่ายซ้าย-ขวาระหว่างไหล ไม่ใช่ขีดตรงดิ่ง
 */
const dripStyle = (d: Drip): DripVars => ({
  left: d.left,
  animation: `fsDrip ${d.dur} linear ${d.delay} infinite`,
  '--drip-len': d.len,
  '--drip-w': d.w,
  '--drip-drift': d.drift,
  '--drip-fall': d.fall,
});

export function GlassDrops({ drips }: GlassDropsProps) {
  return (
    <>
      {drips.map((d) => (
        <span
          key={`drip-${d.left}-${d.delay}`}
          aria-hidden="true"
          data-effect="drip"
          className={s.drip}
          style={dripStyle(d)}
        />
      ))}
    </>
  );
}
