import type { ClimateKey } from './sensor';

/** เกณฑ์ค่าปกติ — ตรงกับ HUD ในต้นแบบ */
export interface Range {
  readonly lo: number;
  readonly hi: number;
  readonly min: number;
  readonly max: number;
}

/**
 * ค่า min/max = ปลายสเกลของวงแหวน gauge, lo/hi = ช่วงที่ถือว่าปกติ
 *
 * หมายเหตุความต่างจากสเปก: สเปกเขียน lux.max = 60 แต่ `Farm Scene.dc.html` (hudDef)
 * ใช้ dmax = 55 → ยึดต้นแบบตามกฎข้อ 0.1
 *
 * CO₂ ถูกตัดออกจากระบบแล้ว (ฟาร์มไม่มีเซนเซอร์ CO₂) ต้นแบบมี dmax 1400
 */
export const CLIMATE_RANGE = {
  temp: { lo: 22, hi: 32, min: 10, max: 42 },
  rh: { lo: 60, hi: 80, min: 20, max: 100 },
  lux: { lo: 15, hi: 45, min: 0, max: 55 },
} as const satisfies Record<ClimateKey, Range>;

/**
 * ระยะเบี่ยงเบนที่ยังนับว่า "เล็กน้อย" คิดเป็นสัดส่วนของ (hi - lo)
 * เกินกว่านี้ = วิกฤต (ต้นแบบใช้ 0.25)
 */
export const CLIMATE_DEVIATION_CRIT = 0.25;

/** เกณฑ์ความชื้นดินรายโซน */
export const SOIL = { critical: 32, low: 42, optimalLo: 45, optimalHi: 70 } as const;

/** ระดับน้ำในถังขั้นต่ำที่ยอมให้เปิดปั๊ม (guard rule G1) */
export const TANK_MIN_PCT = 20;

/** อุณหภูมิที่บังคับให้พัดลมใบใหญ่ต้องเปิดค้างอย่างน้อย 1 ตัว (guard rule G2) */
export const BIG_FAN_LOCK_TEMP = 33;
