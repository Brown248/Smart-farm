import { useEffect, useRef, useState } from 'react';
import type { ClimateValues } from '@shared/sensor';
import { mix } from '@/lib/format';

/** จำนวนก้าวและจังหวะการไล่ตัวเลข — ตรงกับต้นแบบ (8 ก้าว × 95ms, ผสม 0.38) */
export const COUNT_STEPS = 8;
export const COUNT_INTERVAL_MS = 95;
export const COUNT_MIX = 0.38;

/** ก้าวใหญ่พอที่จะ "ไล่ตัวเลข" ให้เห็น (โหลดครั้งแรก / ค่าจริงเพิ่งมา / สลับโหมด) */
const BIG_DELTA = { temp: 1.5, rh: 5, lux: 5 };

/**
 * ไล่ตัวเลขบน HUD เข้าหาค่าจริงแทนที่จะกระโดด
 * ถ้าผู้ใช้ตั้ง reduced-motion จะข้ามการไล่และใช้ค่าจริงทันที
 *
 * ไล่เฉพาะตอน "เดลต้าใหญ่" (โหลดครั้งแรก/ค่าจริงเพิ่งมา) — ค่าที่ drift เล็กๆ ทุก ~3 วิ ให้ snap ตรง
 * ไม่งั้นทุก tick จะยิง setState 8 รอบ = re-render ทั้งฉากเกม (HUD+backdrop+โซน+agent+particles) รัวๆ
 */
export function useCountUp(target: ClimateValues, reduced: boolean): ClimateValues {
  const [display, setDisplay] = useState<ClimateValues>(target);
  const targetRef = useRef(target);
  targetRef.current = target;
  const prevTarget = useRef(target);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    const p = prevTarget.current;
    prevTarget.current = target;
    const big =
      Math.abs(target.temp - p.temp) > BIG_DELTA.temp ||
      Math.abs(target.rh - p.rh) > BIG_DELTA.rh ||
      Math.abs(target.lux - p.lux) > BIG_DELTA.lux;
    if (!big) {
      setDisplay(target); // drift เล็ก → snap ไม่ไล่ (กัน re-render storm)
      return;
    }
    let step = 0;
    const id = window.setInterval(() => {
      step += 1;
      setDisplay((d) => {
        const c = targetRef.current;
        return {
          temp: mix(d.temp, c.temp, COUNT_MIX),
          rh: mix(d.rh, c.rh, COUNT_MIX),
          lux: mix(d.lux, c.lux, COUNT_MIX),
        };
      });
      if (step >= COUNT_STEPS) window.clearInterval(id);
    }, COUNT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [target, reduced]);

  return reduced ? target : display;
}
