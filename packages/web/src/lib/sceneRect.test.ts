import { describe, expect, it } from 'vitest';
import { CROP_ANCHOR_Y, MAX_CROP, SCENE_AR, sceneRect } from './sceneRect';

const ratio = (w: number, h: number) => w / h;

describe('sceneRect', () => {
  it('รักษาสัดส่วนภาพเสมอ ไม่ยืดภาพในทุกขนาดจอ', () => {
    const sizes: readonly (readonly [number, number])[] = [
      [1280, 800],
      [1920, 1080],
      [1024, 768],
      [820, 1180],
      [390, 844],
      [2560, 1080],
    ];
    for (const [vw, vh] of sizes) {
      const r = sceneRect(vw, vh);
      expect(ratio(r.w, r.h)).toBeCloseTo(SCENE_AR, 6);
    }
  });

  it('จอ 16:9 ทั่วไป: cover เต็มความกว้างพอดี', () => {
    const r = sceneRect(1920, 1080);
    expect(r.w).toBeCloseTo(1920, 6);
    expect(r.l).toBeCloseTo(0, 6);
    expect(r.h).toBeGreaterThan(1080); // ล้นบน-ล่างเล็กน้อย ตามที่ตั้งใจ
  });

  it('จอกว้างพิเศษ: ชนเพดาน crop แล้วเหลือขอบให้ภาพเบลอด้านหลัง', () => {
    const vw = 2560;
    const vh = 1080;
    const containW = Math.min(vw, vh * SCENE_AR);
    const r = sceneRect(vw, vh);
    expect(r.w).toBeCloseTo(containW * MAX_CROP, 6);
    expect(r.w).toBeLessThan(vw);
    expect(r.l).toBeGreaterThan(0);
  });

  it('crop ไม่เกินเพดานที่ตั้งไว้', () => {
    // จอสูงมาก — cover จะต้องขยายเกินเพดาน จึงถูกจำกัดไว้ที่ containW * MAX_CROP
    const vw = 800;
    const vh = 1400;
    const containW = Math.min(vw, vh * SCENE_AR);
    const r = sceneRect(vw, vh);
    expect(r.w).toBeCloseTo(containW * MAX_CROP, 6);
    expect(r.w / containW).toBeLessThanOrEqual(MAX_CROP + 1e-9);
  });

  /**
   * สิ่งที่ผู้ใช้สนใจจริงๆ ไม่ใช่ตัวเลขเพดาน แต่คือ "เต็มจอไหม" กับ "ของหายไหม"
   * เคยตั้งเพดานไว้ 1.24 แล้วเบราว์เซอร์ขยายเต็มจอบน 1080p มีแถบเบลอโผล่ข้างละ 10–105px
   */
  it.each([
    [1920, 955, '1080p ขยายเต็มจอ'],
    [1920, 860, '1080p + bookmark bar'],
    [1536, 730, 'โน้ตบุ๊กขยายเต็มจอ'],
    [1366, 700, 'จอเล็ก'],
  ])('%s×%s (%s): เต็มความกว้าง ไม่มีแถบเบลอ', (vw, vh) => {
    const r = sceneRect(vw as number, vh as number);
    expect(r.w).toBeGreaterThanOrEqual((vw as number) - 0.5);
    expect(r.l).toBeLessThanOrEqual(0.5);
  });

  /**
   * ต่อให้ crop มากขึ้น ของที่ต้องกดได้ต้องยังอยู่ในจอ
   * หลอดไฟดวงบนสุดอยู่ y 14.5% · หมุดโซนล่างสุด (สตรอเบอร์รี่) อยู่ y 77%
   */
  it.each([
    [1920, 955],
    [1920, 860],
    [1536, 730],
    [3440, 1330],
  ])('%s×%s: หลอดไฟบนสุดกับหมุดโซนล่างสุดยังอยู่ในจอ', (vw, vh) => {
    const r = sceneRect(vw as number, vh as number);
    const topPct = (-r.t / r.h) * 100;
    const bottomPct = ((-r.t + (vh as number)) / r.h) * 100;
    expect(topPct, 'หลอดไฟบนสุดหลุดจอ').toBeLessThanOrEqual(14.5);
    expect(bottomPct, 'หมุดโซนล่างสุดหลุดจอ').toBeGreaterThanOrEqual(77);
  });

  it('จอแคบ: ภาพเล็กกว่าจอแนวตั้ง แล้วจัดกึ่งกลาง (ไม่ใช่ crop)', () => {
    const vw = 390;
    const vh = 844;
    const r = sceneRect(vw, vh);
    expect(r.h).toBeLessThan(vh);
    expect(r.t).toBeCloseTo((vh - r.h) / 2, 6);
  });

  it('เมื่อภาพสูงกว่าจอ จะเลื่อนขึ้นตามจุดยึด 42% ไม่ใช่กึ่งกลาง', () => {
    const vw = 1920;
    const vh = 700;
    const r = sceneRect(vw, vh);
    expect(r.h).toBeGreaterThanOrEqual(vh);
    expect(r.t).toBeCloseTo(-(r.h - vh) * CROP_ANCHOR_Y, 6);
    expect(r.t).toBeLessThan(0);
  });

  it('จัดกึ่งกลางแนวนอนเสมอ', () => {
    const r = sceneRect(1000, 1000);
    expect(r.l).toBeCloseTo((1000 - r.w) / 2, 6);
  });
});
