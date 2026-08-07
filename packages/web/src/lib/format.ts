/** เวลา HH:MM แบบเดียวกับต้นแบบ */
export function hhmm(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/**
 * เวลา HH:MM ตามเขตเวลาไทย (Asia/Bangkok) — ไม่ขึ้นกับ timezone ของเครื่องผู้ใช้
 * ใช้คู่กับพยากรณ์อากาศที่ดึงแบบเวลาไทย เพื่อให้ "กลางคืน/ฝน" กับนาฬิกาตรงกันเสมอ
 */
export function hhmmBangkok(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * ชั่วโมงแบบเศษ (h + m/60) ตามเขตเวลาไทย — ใช้ตัดสินกลางวัน/กลางคืนและเฉดแสงตามช่วงวัน
 * ต้องอิงเวลาไทยให้ตรงกับนาฬิกา HUD และ `is_day` ของพยากรณ์ ไม่ใช่เวลาเครื่องผู้ใช้
 */
export function hourBangkok(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h + m / 60;
}

/** วัน-เดือนแบบสั้นตามภาษา ที่เขตเวลาไทย (เช่น "อ. 5 ส.ค.") */
export function dateShortBangkok(d: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** ผสมค่าเดิมเข้าหาค่าใหม่ (ใช้ทำ count-up ของ HUD) */
export const mix = (from: number, to: number, k: number): number => from + (to - from) * k;

/** เวลาแบบวินาทีสำหรับ CSS delay/duration */
export const secs = (n: number): string => n + 's';

export const pct = (n: number): string => n + '%';
