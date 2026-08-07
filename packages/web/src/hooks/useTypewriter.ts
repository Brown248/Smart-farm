import { useEffect, useState } from 'react';

/** พิมพ์ทีละ 2 ตัวอักษรทุก 17ms — ตรงกับต้นแบบ */
export const TYPE_STEP = 2;
export const TYPE_INTERVAL_MS = 17;

/**
 * เอฟเฟกต์พิมพ์ข้อความของ agent
 * ถ้าผู้ใช้ตั้ง reduced-motion จะแสดงข้อความเต็มทันที
 */
export function useTypewriter(message: string, reduced: boolean): string {
  const [typed, setTyped] = useState(reduced ? message : '');

  useEffect(() => {
    if (reduced) {
      setTyped(message);
      return;
    }
    setTyped('');
    let n = 0;
    const id = window.setInterval(() => {
      n = Math.min(message.length, n + TYPE_STEP);
      setTyped(message.slice(0, n));
      if (n >= message.length) window.clearInterval(id);
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [message, reduced]);

  return typed;
}
