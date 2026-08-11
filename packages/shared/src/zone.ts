export const ZONE_IDS = [
  'kale',
  'flower',
  'rosemary',
  'mushroom',
  'lettuce',
  'cucumber',
  'strawberry',
  'tomato',
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

/**
 * 🔴 เคยมี `'watering'` อยู่ด้วย — **ถอดออกแล้ว 2026-08-11**
 * โรงเรือนนี้ไม่มีระบบรดน้ำ ปั๊มที่มีคือปั๊มคูลลิ่งแพด (ดู DESIGN_SOURCE ข้อ 37)
 */
export type ZoneStatus = 'ok' | 'low' | 'critical';
export type ZoneMode = 'manual' | 'schedule' | 'moisture' | 'hybrid';

/** [x, y, w, h] เป็น % ของภาพฉาก — คาลิเบรตกับภาพจริงแล้ว */
export type Box = readonly [number, number, number, number];
/** [x, y] เป็น % ของภาพฉาก */
export type Point = readonly [number, number];

export interface Zone {
  readonly id: ZoneId;
  readonly box: Box;
  readonly dot: Point;
  readonly soil: number;
  readonly status: ZoneStatus;
  readonly mode: ZoneMode;
}

/**
 * โซนอย่างที่หน้าฟาร์มเกมรู้จัก — ยังไม่มีข้อมูลโหมดรายโซน
 * (โหมดรายโซนมาพร้อม Zone Drawer ในเฟส 3)
 */
export type SceneZone = Omit<Zone, 'mode'>;

/** ข้อมูลเท่าที่ต้องใช้ตัดสินสถานะและข้อความ */
export type ZoneReading = Pick<Zone, 'id' | 'soil' | 'status'>;
