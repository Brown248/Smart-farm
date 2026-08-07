import { useEffect, useState } from 'react';
import { hourBangkok } from '@/lib/format';

export const LIGHT_MODES = ['day', 'auto', 'night'] as const;
export type LightMode = (typeof LIGHT_MODES)[number];

/**
 * โหมด auto = กลางคืนตั้งแต่ 18:00 ถึงก่อน 06:00 (ตรงกับต้นแบบ)
 * ใช้ชั่วโมง**เวลาไทย** ให้ตรงกับนาฬิกา HUD และ `is_day` ของพยากรณ์ ไม่ใช่เวลาเครื่อง
 * (โหมด auto จะใช้ก็ต่อเมื่อดึงพยากรณ์ไม่ได้ — เป็น fallback ที่ต้องยังอิงเวลาไทย)
 */
export function isNight(mode: LightMode, now: Date): boolean {
  if (mode === 'day') return false;
  if (mode === 'night') return true;
  const h = hourBangkok(now);
  return h >= 18 || h < 6;
}

/** เวลาปัจจุบัน เดินทุก 10 วินาที — พอสำหรับนาฬิกา HH:MM และเฉดแสงตามช่วงวัน */
export function useClock(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

export const nextLightMode = (mode: LightMode): LightMode =>
  mode === 'auto' ? 'day' : mode === 'day' ? 'night' : 'auto';

/** โหมดฝนในฉาก: auto = ตามอากาศจริง · on/off = ผู้ใช้บังคับ (วนกลับไป auto ได้) */
export type RainMode = 'auto' | 'on' | 'off';
