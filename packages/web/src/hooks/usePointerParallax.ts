import { useEffect } from 'react';
import type { RefObject } from 'react';

/** ระยะขยับสูงสุดของฉากตามเมาส์ (px) — ละเอียดมากโดยตั้งใจ */
const AMPLITUDE_X = -6;
const AMPLITUDE_Y = -4;
/** ค่า lerp ต่อเฟรม — ยิ่งน้อยยิ่งหน่วงนุ่ม */
const EASE = 0.04;

/**
 * ขยับฉากตามตำแหน่งเมาส์แบบหน่วง — พอร์ตตรงจากต้นแบบ
 * เขียน transform ลง DOM ตรงๆ ไม่ผ่าน state จึงไม่ทำให้ re-render
 */
export function usePointerParallax(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.parentElement?.getBoundingClientRect() ?? el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      target.x = (e.clientX / r.width - 0.5) * 2;
      target.y = (e.clientY / r.height - 0.5) * 2;
    };

    const loop = () => {
      current.x += (target.x - current.x) * EASE;
      current.y += (target.y - current.y) * EASE;
      el.style.transform = `translate3d(${(current.x * AMPLITUDE_X).toFixed(2)}px, ${(
        current.y * AMPLITUDE_Y
      ).toFixed(2)}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [ref, enabled]);
}
