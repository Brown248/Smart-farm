import { useCallback, useMemo, useRef, useState } from 'react';

export interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly run: () => void;
  /** 'warn' = กล่องเตือนความปลอดภัย (ไอคอน/สีเตือน) เช่นตอน guard ทัก — กดยืนยันเพื่อทำต่อ */
  readonly tone?: 'warn';
  /** ข้อความปุ่มยืนยันเฉพาะกิจ (เช่น "ดำเนินการต่อ") — ไม่ใส่ = ใช้ค่าเริ่มต้นของแต่ละกล่อง */
  readonly confirmLabel?: string;
}

export interface ConfirmApi {
  readonly request: ConfirmRequest | null;
  readonly ask: (req: ConfirmRequest) => void;
  readonly cancel: () => void;
  readonly accept: () => void;
}

/**
 * หน้าต่างยืนยันกลาง ใช้ร่วมกันทั้งคำสั่งอุปกรณ์ / รดน้ำโซน / ปลดล็อกระบบ
 * Emergency Stop ตอน "สั่งหยุด" ไม่ผ่าน hook นี้ — ออกแบบให้กดครั้งเดียวติด
 *
 * **สำคัญ: ห้ามเรียก `run()` ข้างใน updater ของ `setState`**
 * ของเดิมเขียน `setRequest((cur) => { cur?.run(); return null; })` ซึ่งผิดสองชั้น
 *   1. updater ต้องเป็นฟังก์ชันบริสุทธิ์ — React เรียกมันตอน render
 *      พอ `run()` ไปสั่ง setState ของ provider อื่น จึงเกิด setState ระหว่าง render
 *   2. `<StrictMode>` เรียก updater **สองครั้ง** ในโหมด dev
 *      → กดยืนยันหนเดียวแต่คำสั่งถูกส่งสองรอบ (log ซ้ำ · ตั้ง timer ซ้ำ)
 *
 * จึงต้องอ่านคำขอจาก ref แล้วสั่งงานนอก updater — `run()` ทำงานครั้งเดียวเสมอ
 */
export function useConfirm(): ConfirmApi {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const pending = useRef<ConfirmRequest | null>(null);
  pending.current = request;

  const cancel = useCallback(() => {
    pending.current = null;
    setRequest(null);
  }, []);

  const accept = useCallback(() => {
    const cur = pending.current;
    if (!cur) return;
    // เคลียร์ก่อนสั่ง กันกดยืนยันรัวสองที
    pending.current = null;
    setRequest(null);
    cur.run();
  }, []);

  // memo ค่าที่คืน — `setRequest`/cancel/accept นิ่งอยู่แล้ว จึงเปลี่ยน identity เฉพาะตอน `request` ขยับ
  // (สำคัญ: ผู้เรียกอย่าง useDeviceCommand ใส่ `confirm` ใน deps ของ useCallback — ถ้าคืน object ใหม่
  //  ทุก render `command.press` จะ identity เปลี่ยนทุก render → memo ของการ์ดอุปกรณ์ใช้ไม่ได้)
  return useMemo(() => ({ request, ask: setRequest, cancel, accept }), [request, cancel, accept]);
}
