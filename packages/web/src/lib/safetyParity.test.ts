import { describe, expect, it } from 'vitest';
import { bigFanOffBlocked, guard, isBigFan } from './guards';
import { BIG_FAN_LOCK_TEMP } from '@shared/thresholds';
import type { Device } from '@shared/device';
import { TH } from '@/i18n/th';

/**
 * ฉากเกมกับหน้าควบคุมโรงเรือน **คุมอุปกรณ์ 4 ตัวเดียวกัน** แต่เก็บสถานะคนละแบบ
 * ถ้ากฎกันคำสั่งไม่ตรงกัน อุปกรณ์ตัวเดียวกันจะมีนโยบายความปลอดภัยสองแบบ
 * ขึ้นกับว่าผู้ใช้เปิดหน้าไหนอยู่ — เทสชุดนี้ล็อกไม่ให้เกิดเรื่องนั้น
 */
const dev = (id: string, on: boolean): Device =>
  ({ id, on, online: true, pending: null }) as unknown as Device;

describe('กฎ G2 ต้องเป็นตัวเดียวกันทั้งสองหน้า', () => {
  it('รู้จักพัดลมใบใหญ่ทั้งสองตัว และไม่เหมาเอาตัวอื่นด้วย', () => {
    expect(isBigFan('big1')).toBe(true);
    expect(isBigFan('big2')).toBe(true);
    for (const id of ['sml1', 'pump'] as const) {
      expect(isBigFan(id), `${id} ไม่ใช่พัดลมใบใหญ่`).toBe(false);
    }
  });

  it('ร้อนเกินเกณฑ์ + อีกตัวดับอยู่ → ปิดไม่ได้', () => {
    expect(bigFanOffBlocked(BIG_FAN_LOCK_TEMP + 1, false)).toBe(true);
  });

  it('ร้อนเกินเกณฑ์ แต่อีกตัวยังทำงาน → ปิดได้ (ยังมีตัวระบายเหลือ)', () => {
    expect(bigFanOffBlocked(BIG_FAN_LOCK_TEMP + 1, true)).toBe(false);
  });

  it('อุณหภูมิพอดีเกณฑ์ยังไม่บล็อก — บล็อกเมื่อ "เกิน" เท่านั้น', () => {
    expect(bigFanOffBlocked(BIG_FAN_LOCK_TEMP, false)).toBe(false);
  });

  it('ไม่ร้อน → ปิดได้ตามปกติ', () => {
    expect(bigFanOffBlocked(BIG_FAN_LOCK_TEMP - 5, false)).toBe(false);
  });

  /** ทางฉากเกมเรียกผ่าน `guard()` — ผลลัพธ์ต้องตรงกับ `bigFanOffBlocked` เสมอ */
  it('guard() ของฉากเกมให้ผลตรงกับกฎกลาง', () => {
    const hot = BIG_FAN_LOCK_TEMP + 2;
    const ctx = (otherOn: boolean) => ({
      devices: [dev('big1', true), dev('big2', otherOn)],
      tank: 100,
      temp: hot,
      t: TH,
    });

    for (const otherOn of [true, false]) {
      const viaGuard = guard('big1', false, ctx(otherOn)) !== null;
      expect(viaGuard, `อีกตัว ${otherOn ? 'ทำงาน' : 'ดับ'}`).toBe(bigFanOffBlocked(hot, otherOn));
    }
  });

  /**
   * G1 (ปั๊ม-ถังน้ำ) ถูกถอดออก — ถังเป็นค่า mock ไม่มีเซนเซอร์ กันไม่ได้จริง
   * แทนด้วยข้อความยืนยันเช็คน้ำ + auto-cutoff (ดู `useDeviceCommand`) → guard ปั๊มไม่บล็อกตามถังอีก
   */
  it('ถอด G1 แล้ว — ปั๊มเปิดได้แม้ถังน้ำต่ำ (ไม่มี guard เรื่องถัง)', () => {
    const ctx = (tank: number) => ({ devices: [dev('pump', false)], tank, temp: 25, t: TH });
    expect(guard('pump', true, ctx(5))).toBeNull();
    expect(guard('pump', true, ctx(0))).toBeNull();
  });
});
