import { SOIL } from '@shared/thresholds';
import type { ZoneStatus } from '@shared/zone';
import { levelFor } from './dashboard';
import type { DashLevel, Threshold } from './dashboard';
import type { ZoneBaseStatus } from './irrigation';

/**
 * แปลงค่าความชื้นดินจริง → สถานะของแต่ละหน้า
 *
 * **ทำไมต้องมี** — ความชื้นดินเคยฝังเป็นเลขรายโซนใน 3 ที่ (`IRR_ZONES` · `DASH_ZONES` ·
 * `INITIAL_ZONE_STATE`) และแต่ละที่ใช้คำว่า "สถานะ" คนละชุด (ฉากเกม `ok/low/critical` ·
 * ชลประทาน `normal/warn/dry` · แดชบอร์ด `normal/warn/crit`) พอมีเซนเซอร์จริงตัวเดียว
 * ค่าจริงไปไม่ถึง 2 หน้า และสถานะที่ฝังไว้ก็ขัดกับตัวเลขจริง
 *
 * รวมตรรกะ "ดินเปียกแค่ไหน = สถานะอะไร" ไว้ที่เดียว ทั้ง 3 หน้าจึงตัดสินตรงกัน
 * เกณฑ์มาจาก `SOIL` (`@shared/thresholds`) ตัวเดียวกับที่ guard/คำแนะนำใช้
 */

/** สถานะโซนของฉากเกม/provider — ยิ่งดินแห้งยิ่งวิกฤต */
export function soilToZoneStatus(soil: number): Exclude<ZoneStatus, 'watering'> {
  if (soil < SOIL.critical) return 'critical';
  if (soil < SOIL.low) return 'low';
  return 'ok';
}

/** สถานะโซนของหน้าชลประทาน */
export function soilToIrrStatus(soil: number): ZoneBaseStatus {
  if (soil < SOIL.critical) return 'dry';
  if (soil < SOIL.low) return 'warn';
  return 'normal';
}

/** ระดับของแดชบอร์ด — ใช้เกณฑ์ที่ผู้ใช้ตั้งได้ (เหมือนการ์ดเซนเซอร์) */
export function soilToDashLevel(soil: number, th: Threshold): DashLevel {
  return levelFor(soil, th);
}
