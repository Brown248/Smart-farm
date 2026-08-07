import { describe, expect, it } from 'vitest';
import { isRainingNow, weatherLook } from './weatherCode';

/** แปลงรหัส WMO → หน้าตา/ฝน — ยึดตารางรหัสของ Open-Meteo */
describe('weatherLook', () => {
  it('แจ่มใส (0–1) → แดด', () => {
    expect(weatherLook(0).kind).toBe('clear');
    expect(weatherLook(1).icon).toBe('wxSun');
  });
  it('มีเมฆ (2–3) → เมฆ', () => {
    expect(weatherLook(2).kind).toBe('cloud');
    expect(weatherLook(3).kind).toBe('cloud');
  });
  it('หมอก (45/48) → เมฆ (fog)', () => {
    expect(weatherLook(45).kind).toBe('fog');
  });
  it('ฝน (51–67 · 80–82) → ฝน', () => {
    for (const c of [51, 61, 65, 80, 82]) expect(weatherLook(c).kind, String(c)).toBe('rain');
  });
  it('พายุฝนฟ้าคะนอง (95–99) → storm', () => {
    expect(weatherLook(95).kind).toBe('storm');
    expect(weatherLook(99).icon).toBe('wxRain');
  });
  it('หิมะ (71–86) → เมฆ (เมืองไทยไม่มีหิมะ)', () => {
    expect(weatherLook(75).kind).toBe('cloud');
  });
});

describe('isRainingNow', () => {
  it('รหัสฝน/พายุ → ฝนตก แม้ยังวัดปริมาณไม่ได้', () => {
    expect(isRainingNow(61, 0)).toBe(true);
    expect(isRainingNow(95, 0)).toBe(true);
  });
  it('วัดปริมาณฝนได้ > 0 → ฝนตก แม้รหัสไม่ใช่กลุ่มฝน', () => {
    expect(isRainingNow(3, 0.4)).toBe(true);
  });
  it('แจ่มใส ไม่มีฝน → ไม่ตก', () => {
    expect(isRainingNow(1, 0)).toBe(false);
    expect(isRainingNow(3, 0)).toBe(false);
  });
});
