/**
 * map อุปกรณ์ในโรงเรือน ↔ channel ของ HandySense
 *
 * 🔴 จุดพลาดอันดับ 1 ของ guide: map ผิด = สั่ง relay ผิดตัวในของจริง **โดยไม่มี error**
 * ค่านี้จึงเป็น single source ที่เดียว · แก้ที่นี่ที่เดียวถ้าฮาร์ดแวร์ย้ายช่อง
 *
 *   led0 (ch0) = พัดลมใหญ่ #1 (big1) — **ทำงานตัวเดียว** ไม่มีตัวพ่วง
 *   led1 (ch1) = พัดลมใหญ่ #2 (big2) — **พัดลมเล็ก (sml1) ต่อสายพ่วงอยู่ช่องนี้** ไม่มี relay แยก
 *   led2 (ch2) = ปั๊มน้ำ (pump) — ต่อ relay จริงแล้ว (เดิมเข้าใจผิดว่ายังไม่ต่อ)
 *   led3 (ch3) = solenoid **ไม่ใช้แล้ว** (test channel · ไม่ผูกกับอุปกรณ์)
 *
 * ⚠️ ประวัติ:
 *   - เคยตั้งผิดเป็น `sml1=ch2 · pump=null` → กดปุ่ม "พัดลมเล็ก" ไปโดนปั๊ม ฯลฯ (แก้แล้ว)
 *   - เคยตั้งใบเล็กพ่วง big1 (ch0) → แอปโชว์ใบเล็ก "ปิด" ทั้งที่หมุนอยู่ (led0=false แต่ของจริงหมุนตาม
 *     ใหญ่#2) · เจ้าของงานยืนยันหน้างาน 2026-08-07 ว่า **ใบเล็กพ่วงกับใหญ่#2 (ch1) · ใหญ่#1 เดี่ยว**
 *     → ย้าย sml1 มา ch1 พ่วง big2 (ดู docs/MIGRATION.md)
 */
import type { DeviceId } from '@shared/device';
import type { HsChannel } from '@shared/handysense';

export const CHANNEL_BY_DEVICE: Readonly<Record<DeviceId, HsChannel | null>> = {
  big1: 0,
  big2: 1,
  sml1: 1, // พ่วงสายกับ big2 — คุมผ่าน ch1 เดียวกัน (state ตามกัน · สั่งแยกไม่ได้ · ดู BONDED_TO)
  pump: 2,
};

/**
 * อุปกรณ์ที่ **ต่อสายพ่วงกับอุปกรณ์อื่น** ไม่มี relay ของตัวเอง → คุมแยกไม่ได้ · สถานะตาม "ตัวหลัก"
 * (พัดลมเล็กพ่วงกับพัดลมใหญ่ #2 = big2 บน ch1 · เจ้าของงานยืนยันหน้างาน 2026-08-07) · UI ต้อง disable ปุ่มของตัวพ่วง + บอกว่าทำงานตามตัวหลัก
 */
export const BONDED_TO: Readonly<Partial<Record<DeviceId, DeviceId>>> = {
  sml1: 'big2',
};

/** channel จริงของอุปกรณ์ · `null` = ไม่มี relay (ไม่มีในตอนนี้ · เผื่ออนาคต) */
export function channelOf(id: DeviceId): HsChannel | null {
  return CHANNEL_BY_DEVICE[id];
}

/** ตัวหลักที่อุปกรณ์นี้พ่วงอยู่ · `null` = ไม่ได้พ่วง (คุมเองได้) */
export function bondedTo(id: DeviceId): DeviceId | null {
  return BONDED_TO[id] ?? null;
}

/** อุปกรณ์นี้ต่อพ่วงกับตัวอื่นไหม (คุมแยกไม่ได้) */
export function isBonded(id: DeviceId): boolean {
  return BONDED_TO[id] !== undefined;
}
