import { useEffect, useRef, useState } from 'react';
import { useFarmState } from '@/state/FarmStateProvider';

/**
 * บอกผู้ใช้ล่วงหน้าว่าระบบจะปิดปั๊มเมื่อไหร่ — **ห้ามให้ปั๊มดับเองแบบไม่มีปี่มีขลุ่ย**
 *
 * 🔴 เจ้าของงานเจอเองหน้างาน (2026-08-10): กดเปิดปั๊มจากแอป HandySense
 * เว็บเราขึ้นว่า "เปิด" ถูกต้อง แล้วอยู่ๆ ก็ดับไปเฉยๆ หาสาเหตุไม่เจอ
 * เพราะ auto-cutoff 20 นาทีของเราจับเวลาจาก `led` ที่อุปกรณ์รายงาน **ไม่ได้ดูว่าใครเปิด**
 * (จงใจให้เป็นแบบนั้น — เป็น safety ของทั้งฟาร์ม) แต่ตอนนั้นเขียนแค่บรรทัดในสมุดบันทึก
 * ซึ่งไม่มีใครเปิดดูตอนกำลังยืนงงอยู่หน้าปั๊ม
 *
 * ตัวตัดที่มองไม่เห็น = ตัวตัดที่ผู้ใช้ตีความว่าอุปกรณ์เสีย
 */

/** ms ที่เหลือก่อนระบบตัดปั๊ม · `null` = ไม่ได้นับอยู่ (ปั๊มไม่ได้เดิน) */
export function usePumpCutoffLeft(): number | null {
  const { pumpCutoffAt } = useFarmState();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (pumpCutoffAt === null) {
      setLeft(null);
      return;
    }
    // อัปเดตทันทีหนึ่งครั้งก่อน ไม่งั้นเลขจะค้างว่างอยู่ 1 วินาทีตอนเพิ่งเริ่มนับ
    const tick = () => setLeft(Math.max(0, pumpCutoffAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pumpCutoffAt]);

  return left;
}

/** "12:34" — นาที:วินาที ที่เหลือ (ตัดวินาทีขึ้น จะได้ไม่โชว์ 0:00 ค้างก่อนตัดจริง) */
export function formatCutoffLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * เด้ง toast ทุกครั้งที่ระบบตัดปั๊มจริง — หน้าที่มี toast ของตัวเองเรียกตัวนี้
 * ข้ามครั้งแรกตอน mount เสมอ (ตัวนับที่ค้างอยู่จากก่อนหน้าไม่ใช่เหตุการณ์ใหม่)
 */
export function usePumpCutoffToast(flash: (message: string) => void, message: string): void {
  const { pumpCutoffCount } = useFarmState();
  const seenRef = useRef(pumpCutoffCount);
  // อ่านค่าล่าสุดตอนยิงจริง — ไม่งั้นต้องใส่ flash/message ใน deps แล้ว effect จะรันซ้ำทุก render
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const msgRef = useRef(message);
  msgRef.current = message;

  useEffect(() => {
    if (pumpCutoffCount === seenRef.current) return;
    seenRef.current = pumpCutoffCount;
    flashRef.current(msgRef.current);
  }, [pumpCutoffCount]);
}
