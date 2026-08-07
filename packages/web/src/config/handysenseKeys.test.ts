import { describe, expect, it } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import { CLIMATE_RANGE } from '@shared/thresholds';
import { CLIMATE_KEYS } from '@shared/sensor';
import { LIVE_FIELDS, resolveClimate, resolveSoil, unmatchedKeys } from './telemetryKeys';

/**
 * ค่าจริงของโรงเรือน `handysense-farm` ที่เห็นใน ThingsBoard (ยืนยันจากทีม 2026-08-04 11:59:42)
 *
 * ข้อมูลไหลจาก HandySense/NETPIE เข้า ThingsBoard ด้วยสคริปต์ของทีมอื่น (ไม่ใช่ของ repo นี้)
 * เทสนี้ล็อกว่า **ชื่อ key ที่ device ส่งมาจริงจับคู่กับค่าบนหน้าจอได้ถูกต้อง**
 * โดยไม่ต้องรอสิทธิ์ org — พอได้สิทธิ์แล้วหน้าจอต้องขึ้นค่าตามนี้ทันที
 */
const tv = (value: string): TelemetryValue => ({ value, timestamp: 1785819582000 });

/** สี่ค่าที่ HandySense ส่งมาจริง — ไม่มี CO₂ */
const HANDYSENSE: Readonly<Record<string, TelemetryValue>> = {
  humidity: tv('71.03'),
  light: tv('5.68'),
  soil_moisture: tv('99'),
  temperature: tv('36.29'),
};

describe('จับคู่ค่าจริงของ handysense-farm', () => {
  it('จับคู่ได้ครบทั้ง 4 ค่าที่ device ส่งมา', () => {
    const r = resolveClimate(HANDYSENSE);

    expect(r.values).toEqual({ temp: 36.29, rh: 71.03, lux: 5.68 });
    expect(r.matched).toEqual({ temp: 'temperature', rh: 'humidity', lux: 'light' });
    expect(resolveSoil(HANDYSENSE)).toBe(99);
  });

  /**
   * CO₂ ถูก **ตัดออกจากระบบทั้งหมดแล้ว** (เจ้าของงานสั่ง — ฟาร์มไม่มีเซนเซอร์ CO₂)
   * เทสนี้ล็อกว่าไม่มีใครเอากลับมาใส่ใน `CLIMATE_KEYS` โดยไม่ได้ตั้งใจ
   */
  it('CO₂ ต้องไม่อยู่ในค่าที่หน้าจอใช้เลย', () => {
    expect([...CLIMATE_KEYS]).toEqual(['temp', 'rh', 'lux']);
    expect([...LIVE_FIELDS]).toEqual(['temp', 'rh', 'lux', 'soil']);
  });

  it('ไม่มี key ไหนเหลือค้างที่จับคู่ไม่ได้ — ครบทั้ง 4 ตัว', () => {
    expect(unmatchedKeys(HANDYSENSE)).toEqual([]);
  });

  it('ป้ายบน header จะขึ้นสัดส่วน 4 จาก 4 — ค่าจริงครบทุกตัวที่หน้าจอใช้', () => {
    const r = resolveClimate(HANDYSENSE);
    const live = Object.keys(r.values).length + (resolveSoil(HANDYSENSE) === null ? 0 : 1);

    expect(live).toBe(4);
    expect(LIVE_FIELDS.length).toBe(4);
  });

  /**
   * ทุกค่าอยู่ใน **ช่วงที่เกจแสดงได้** (`min`–`max`) — แสดงผลได้ปกติ ไม่มีเลขล้นหรือ NaN
   * จึง **ไม่ต้องตั้ง `scale`** และ `warnIfOutOfRange()` จะไม่เตือนเรื่องหน่วย
   *
   * สองค่าหลุด **ช่วงเหมาะสม** (`lo`–`hi`) ซึ่งเป็นข้อมูลการเกษตร ไม่ใช่ปัญหาโค้ด:
   * `light 5.68` k lux ต่ำกว่าช่วงดี 15–45 · `soil_moisture 99%` สูงกว่าช่วงดี 45–70
   * → หน้าจอจะขึ้นว่า "แสงน้อย" กับ "ดินเปียกเกิน" ซึ่งถูกต้องตามค่าที่วัดมา
   *
   * ถ้าวันหลังพบว่าหน่วยไม่ตรงจริง ให้ตั้ง `scale` ใน `CLIMATE_KEY_RULES`
   * **ห้ามแก้ที่จุดแสดงผล** และห้ามแปลงหน่วยโดยเดา
   */
  it('ทุกค่าอยู่ในช่วงที่เกจแสดงได้ — ไม่ต้องตั้ง scale', () => {
    const r = resolveClimate(HANDYSENSE);
    const soil = resolveSoil(HANDYSENSE);

    for (const [key, v] of Object.entries(r.values)) {
      const range = CLIMATE_RANGE[key as keyof typeof CLIMATE_RANGE];
      expect(v, key).toBeGreaterThanOrEqual(range.min);
      expect(v, key).toBeLessThanOrEqual(range.max);
    }
    expect(soil).toBeGreaterThanOrEqual(0);
    expect(soil).toBeLessThanOrEqual(100);
  });

  it('ค่าที่หลุดช่วงเหมาะสมคือข้อมูลการเกษตร ไม่ใช่บั๊ก — แสงน้อย · ดินเปียกเกิน', () => {
    const r = resolveClimate(HANDYSENSE);

    expect(r.values.lux!).toBeLessThan(CLIMATE_RANGE.lux.lo);
    expect(resolveSoil(HANDYSENSE)!).toBeGreaterThan(70);
    // อุณหภูมิเกินช่วงดี (22–32) ด้วย — 36.29°C จะไปปลุก guard G2 ที่ 33°C
    expect(r.values.temp!).toBeGreaterThan(CLIMATE_RANGE.temp.hi);
  });
});
