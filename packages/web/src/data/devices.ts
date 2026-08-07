import type { Device } from '@shared/device';
import type { TextKey } from '@/i18n/keys';

/**
 * อุปกรณ์จริง 4 ตัว — พัดลมใหญ่ 2 · พัดลมเล็ก 1 · ปั๊ม 1
 * เจ้าของงานอนุมัติลดพัดลมเล็กจาก 2 → 1 ตัว (ต้นแบบเดิม 2 ตัว · บันทึกใน DESIGN_SOURCE.md)
 * พัดลมเล็กที่เหลือ (`sml1`) เป็น online ควบคุมได้จริง
 */
export const INITIAL_DEVICES: readonly Device[] = [
  { id: 'big1', type: 'bigFan', n: 1, on: true, pending: null, online: true, auto: true },
  { id: 'big2', type: 'bigFan', n: 2, on: false, pending: null, online: true, auto: true },
  // พัดลมเล็กต่อสายพ่วงกับใหญ่ #2 (ch1) — คุมแยกไม่ได้ · เริ่มต้นให้ตรงกับ big2 (โหมดจริง reconcile จาก led1)
  { id: 'sml1', type: 'smallFan', n: 1, on: false, pending: null, online: true, auto: true },
  /**
   * ปั๊มเริ่มต้น **ปิด** — ต้นแบบตั้งเป็นเปิด แต่ตอนนั้นยังสมมติว่ามีวาล์วรายโซน
   * (ปั๊มเปิด + รดแค่ 2 โซน) พอตัดวาล์วออก ปั๊มเปิด = รดทั้ง 8 โซนพร้อมกัน
   * ซึ่งจะกลบสถานะดินจริงของทุกแปลงตั้งแต่เปิดหน้าแรก แปลงที่แห้งจะมองไม่เห็น
   */
  { id: 'pump', type: 'pump', n: 0, on: false, pending: null, online: true, auto: true },
];

/**
 * ระดับน้ำในถังเริ่มต้น (%) — **ถังใบเดียวของทั้งฟาร์ม**
 * ใช้ทั้ง guard rule G1 (ปั๊มเปิดได้เมื่อ > 20%) และรูปถังบนหน้าชลประทาน
 * เคยมีสองค่า (หน้าชลประทานโชว์ 72% แต่ guard ใช้ 62%) — ถังเดียวกันบอกคนละเลข
 */
export const INITIAL_TANK_PCT = 62;

/** ใครเป็นคนสั่ง — ใช้เลือกสีจุดกับป้ายกำกับใน control log */
export type CmdSource = 'manual' | 'schedule' | 'sensor';

/**
 * รายการ control log — `key` = ข้อความจาก DICT, `text` = ข้อความที่สร้างตอน runtime
 *
 * `src` ต้องบันทึกไว้ตอนเขียน log ห้ามเดาทีหลัง — ของเดิมหน้าชลประทานเดาจาก
 * `l.text ? 'manual' : 'schedule'` ซึ่งผิดทันทีที่มีคำสั่งอัตโนมัติสร้างข้อความเอง
 */
export interface LogEntry {
  readonly t: string;
  readonly key?: TextKey;
  readonly text?: string;
  readonly src: CmdSource;
}

/**
 * สี · ป้ายกำกับ · และ "ใครสั่ง" ของแต่ละแหล่งที่มา
 * เดิมมีสองตาราง (`CMD_SOURCE_META` ที่ชลประทาน กับ `GH_SRC_META` ที่โรงเรือน)
 * ใช้คนละคีย์แปลทั้งที่หมายถึงเรื่องเดียวกัน
 */
export const CMD_SOURCE_META: Readonly<
  Record<CmdSource, { color: string; bg: string; labelKey: TextKey; byKey: TextKey }>
> = {
  manual: {
    color: 'var(--d-muted)',
    bg: 'var(--d-line-2)',
    labelKey: 'tlManual',
    byKey: 'byUser',
  },
  schedule: {
    color: 'var(--brand-green)',
    bg: 'var(--d-ok-bg)',
    labelKey: 'tlSchedule',
    byKey: 'bySystem',
  },
  sensor: {
    color: 'var(--d-m-hum)',
    bg: 'var(--d-m-hum-bg)',
    labelKey: 'srcSensor',
    byKey: 'byRule',
  },
};

/**
 * ประวัติคำสั่งตั้งต้น — **ชุดเดียวของทั้งระบบ**
 * รวมของเดิมที่เคยแยกกันอยู่สามที่: `INITIAL_LOG` · `GH_SEED_LOG` · `SEED_CMD_LOG`
 * สองรายการท้ายเป็นของเมื่อวาน (หน้าจอโชว์แต่เวลา ไม่โชว์วันที่ เหมือนต้นแบบ)
 */
export const INITIAL_LOG: readonly LogEntry[] = [
  { t: '11:20', key: 'seedLog1', src: 'sensor' },
  { t: '09:41', key: 'log1', src: 'sensor' },
  { t: '09:12', key: 'log2', src: 'schedule' },
  { t: '09:05', key: 'seedLog3', src: 'manual' },
  { t: '08:55', key: 'log3', src: 'sensor' },
  { t: '08:30', key: 'log4', src: 'manual' },
  { t: '05:30', key: 'clAutoWater', src: 'sensor' },
  { t: '22:00', key: 'seedLog2', src: 'schedule' },
  { t: '13:00', key: 'clSkipRain', src: 'schedule' },
];
