import { useEffect, useState } from 'react';

/** ช่วงเว้นระหว่างฟ้าแลบแต่ละครั้ง (สุ่ม 15–40 วินาที) */
const MIN_GAP_MS = 15_000;
const RANDOM_GAP_MS = 25_000;

/** จังหวะแฟลชคู่ — สว่างแรง ดับ สว่างอ่อน ดับ */
const FLASH: readonly (readonly [number, number])[] = [
  [0, 0.85],
  [120, 0],
  [240, 0.45],
  [360, 0],
];

/**
 * ฟ้าแลบเป็นระยะระหว่างฝนตก
 * ปิดสนิทเมื่อผู้ใช้ตั้ง reduced-motion — แฟลชขาวเป็นสิ่งที่ต้องเคารพค่านี้ที่สุด
 */
export function useLightning(active: boolean, reduced: boolean): number {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!active || reduced) {
      setOpacity(0);
      return;
    }

    const timers: number[] = [];
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const id = window.setTimeout(
        () => {
          for (const [at, value] of FLASH) {
            timers.push(window.setTimeout(() => setOpacity(value), at));
          }
          schedule();
        },
        MIN_GAP_MS + Math.random() * RANDOM_GAP_MS,
      );
      timers.push(id);
    };

    schedule();

    return () => {
      stopped = true;
      timers.forEach(window.clearTimeout);
      setOpacity(0);
    };
  }, [active, reduced]);

  return opacity;
}
