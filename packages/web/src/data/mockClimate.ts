import type { ClimateValues } from '@shared/sensor';
import type { ZoneId, ZoneStatus } from '@shared/zone';

/**
 * ข้อมูลจำลอง — ใช้เป็น fallback เมื่อ env ของการต่อจริงยังไม่ครบ (ดู `config/liveData.ts`)
 * **ห้ามลบ** จนกว่าจะได้ deviceId/orgId จริงและยืนยันว่าข้อมูลสดไหลครบแล้ว
 * ค่าเริ่มต้นและขอบเขตการสุ่มทั้งหมดตรงกับต้นแบบ
 */
export const INITIAL_CLIMATE: ClimateValues = { temp: 33.4, rh: 78, lux: 24.6 };

/** ค่าที่ HUD แสดงในโหมดนำเสนอ — คงที่ อยู่ในเกณฑ์ทุกตัว */
export const PRESENTATION_CLIMATE: ClimateValues = { temp: 27.8, rh: 68, lux: 28.4 };

/** ช่วงที่ค่าจำลองเดินได้ และแอมพลิจูดการสุ่มต่อรอบ (ต้นแบบ: 3.2 วินาที/รอบ) */
export const CLIMATE_DRIFT = {
  temp: { min: 20, max: 38, jitter: 0.35 },
  rh: { min: 45, max: 95, jitter: 1.2 },
  lux: { min: 2, max: 52, jitter: 0.9 },
} as const satisfies Record<keyof ClimateValues, { min: number; max: number; jitter: number }>;

export const CLIMATE_TICK_MS = 3200;

/**
 * ความชื้นดินและสถานะเริ่มต้นรายโซน
 *
 * ⚠️ ไม่มี `'watering'` ในตารางนี้แล้ว — ปั๊มมีตัวเดียวและไม่มีวาล์วรายโซน
 * "กำลังรดน้ำ" จึงเป็นสถานะของ **ทั้งโรงเรือน** ที่ `FarmStateProvider`
 * คำนวณจากปั๊มแล้วทาทับทุกโซนพร้อมกัน (เดิมเห็ด/ผักสลัดตั้งเป็น watering ค้างไว้
 * ทั้งที่ปั๊มตัวเดียวกันจะรดเฉพาะสองโซนนั้นไม่ได้)
 */
export const INITIAL_ZONE_STATE: Readonly<
  Record<ZoneId, { soil: number; status: Exclude<ZoneStatus, 'watering'> }>
> = {
  kale: { soil: 62, status: 'ok' },
  flower: { soil: 58, status: 'ok' },
  rosemary: { soil: 44, status: 'ok' },
  mushroom: { soil: 79, status: 'ok' },
  lettuce: { soil: 66, status: 'ok' },
  cucumber: { soil: 55, status: 'ok' },
  strawberry: { soil: 28, status: 'critical' },
  tomato: { soil: 39, status: 'low' },
};

/** ดินเปลี่ยนต่อรอบ: กำลังรด +0.5 · ไม่ได้รด -0.12 แล้วบวกสัญญาณรบกวน ±0.2 */
export const SOIL_DRIFT = { watering: 0.5, idle: -0.12, noise: 0.4, min: 12, max: 92 } as const;
