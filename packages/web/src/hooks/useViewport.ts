import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export interface Size {
  readonly w: number;
  readonly h: number;
}

/**
 * ขนาดของ element ที่ส่ง ref มา (fallback เป็นขนาดหน้าต่าง)
 * ใช้ทั้ง ResizeObserver และ resize event เหมือนต้นแบบ
 * อัปเดตเมื่อเปลี่ยนเกิน 1px เท่านั้น กัน re-render ถี่เกินจำเป็น
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback: Size): Size {
  const [size, setSize] = useState<Size>(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setSize((prev) =>
        Math.abs(r.width - prev.w) > 1 || Math.abs(r.height - prev.h) > 1
          ? { w: r.width, h: r.height }
          : prev,
      );
    };

    measure();
    window.addEventListener('resize', measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [ref]);

  return size;
}
