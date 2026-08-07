import { useEffect, useRef, useState } from 'react';

/**
 * วัดความกว้างจริงของกล่อง (พิกเซล) เพื่อให้ SVG วาดแบบ 1:1
 *
 * ทำไมต้องวัด: ถ้าใช้ `viewBox` คงที่ + `preserveAspectRatio="none"` ตัวหนังสือ วงกลม
 * และความหนาเส้นจะถูกยืดคนละอัตราส่วนตามแนวนอน/แนวตั้ง ตัวเลขแกนจะบานหรือแบนตามขนาดจอ
 * พอวาดด้วยพิกเซลจริง 1 หน่วยใน SVG = 1px เสมอ ทุกอย่างคมและได้สัดส่วนถูก
 *
 * ค่าเริ่มต้นใช้ตอนยังวัดไม่ได้ (เรนเดอร์รอบแรก / jsdom ที่ไม่มี layout จริง)
 */
export function useElementWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const w = el.getBoundingClientRect().width;
      // jsdom คืน 0 เสมอ — คงค่า fallback ไว้ ดีกว่าได้กราฟกว้าง 0
      if (w > 0) setWidth(Math.round(w));
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
