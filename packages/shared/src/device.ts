export type DeviceType = 'bigFan' | 'smallFan' | 'pump';
export type DeviceId = 'big1' | 'big2' | 'sml1' | 'pump';

/** อุปกรณ์จริงมีแค่ 4 ตัวนี้ (พัดลมใหญ่ 2 · เล็ก 1 · ปั๊ม 1) ห้ามเพิ่มอุปกรณ์ที่ไม่มีจริง */
export interface Device {
  readonly id: DeviceId;
  readonly type: DeviceType;
  readonly n: number;
  readonly on: boolean;
  /** ไม่ null = กำลังรอผลคำสั่ง (ต้อง disable ปุ่ม) */
  readonly pending: 'on' | 'off' | null;
  readonly online: boolean;
  readonly auto: boolean;
}

/** สถานะคำสั่ง — แยก "สั่งแล้ว" ออกจาก "ทำงานจริงแล้ว" (เพราะ pub/sub ไม่การันตี) */
export type CommandState = 'idle' | 'confirming' | 'sending' | 'sent' | 'confirmed' | 'failed';

/** ค่าที่อุปกรณ์กำลังจะเป็น: pending ถ้ามี ไม่งั้นใช้สถานะจริง */
export const deviceRunning = (d: Device): boolean =>
  d.pending != null ? d.pending === 'on' : d.on;
