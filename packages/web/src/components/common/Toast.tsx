import { useEffect, useRef, useState } from 'react';
import styles from './Toast.module.css';

export interface ToastProps {
  readonly message: string | null;
}

/** จางออกช่วงสั้นๆ ก่อนถอดออกจาก DOM — ไม่ให้ toast หายวับทันที (ดูสะดุด) */
const LEAVE_MS = 180;

export function Toast({ message }: ToastProps) {
  // เก็บข้อความที่กำลังแสดงไว้ต่างหาก เพื่อให้ยังอยู่ระหว่างเล่นอนิเมชันจางออก
  const [shown, setShown] = useState<string | null>(message);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (message) {
      setShown(message);
      setLeaving(false);
    } else if (shown) {
      // ข้อความถูกล้าง → เล่นจางออกก่อน แล้วค่อยเอาออกจาก DOM
      setLeaving(true);
      timer.current = window.setTimeout(() => setShown(null), LEAVE_MS);
    }
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [message, shown]);

  if (!shown) return null;
  return (
    <div
      className={leaving ? `${styles.toast} ${styles.leaving}` : styles.toast}
      role="status"
      aria-live="polite"
    >
      {shown}
    </div>
  );
}
