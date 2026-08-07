import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from '@shared/telemetrySocket';
import { resampleHistory } from './resampleHistory';

/**
 * resample ค่าจริง — ใช้รูปแบบ payload จริงจาก backend
 * (เรียงใหม่→เก่า · ค่าเป็น string · ts เป็น ms) ที่ capture มาจาก WebSocket จริง
 */
const pt = (ts: number, value: string): HistoryPoint => ({ ts, value });

describe('resampleHistory', () => {
  it('แบ่งเป็น N ถังเท่าๆ กัน แล้วเฉลี่ยจุดในถัง', () => {
    // ช่วง 0–100, 4 ถัง (กว้างถังละ 25): จุดที่ 10,60,90
    const out = resampleHistory([pt(10, '2'), pt(60, '6'), pt(90, '9')], 0, 100, 4);
    // ถัง0 [0,25)=2 · ถัง1 [25,50)=ว่าง→carry 2 · ถัง2 [50,75)=6 · ถัง3 [75,100]=9
    expect(out).toEqual([2, 2, 6, 9]);
  });

  it('เรียงใหม่→เก่าก็จัดถังถูก (ใช้ ts ไม่ใช่ลำดับใน array)', () => {
    const newestFirst = [pt(90, '9'), pt(60, '6'), pt(10, '2')];
    expect(resampleHistory(newestFirst, 0, 100, 4)).toEqual([2, 2, 6, 9]);
  });

  it('ค่าเป็น string แปลงเป็นเลข · ทศนิยมไม่หาย', () => {
    const out = resampleHistory([pt(10, '35.19'), pt(90, '36.29')], 0, 100, 2);
    expect(out).toEqual([35.19, 36.29]);
  });

  it('ทิ้งจุดที่ค่าเสีย (null/ไม่ใช่เลข) ไม่ให้กลายเป็น NaN บนกราฟ', () => {
    const out = resampleHistory([pt(10, '5'), pt(50, 'n/a'), pt(90, '9')], 0, 100, 3);
    // ถังกลาง (จุดเสีย) ว่าง → carry 5
    expect(out).toEqual([5, 5, 9]);
  });

  it('ทิ้งจุดนอกช่วงเวลา', () => {
    const out = resampleHistory([pt(-50, '99'), pt(50, '5'), pt(200, '99')], 0, 100, 2);
    // เหลือแค่จุด ts=50 → ถัง1 · ถัง0 ว่างเติมด้วยค่าจริงตัวแรก
    expect(out).toEqual([5, 5]);
  });

  it('ถังต้นๆ ที่ว่างเติมด้วยค่าจริงตัวแรก ไม่ขึ้นต้นด้วย NaN', () => {
    const out = resampleHistory([pt(95, '9')], 0, 100, 4);
    expect(out).toEqual([9, 9, 9, 9]);
  });

  it('ไม่มีจุดที่ใช้ได้เลย → คืน null (ให้ผู้เรียก fallback ไป mock)', () => {
    expect(resampleHistory([], 0, 100, 4)).toBeNull();
    expect(resampleHistory([pt(10, 'x')], 0, 100, 4)).toBeNull();
    expect(resampleHistory([pt(500, '5')], 0, 100, 4)).toBeNull();
  });

  it('พารามิเตอร์ไม่ถูกต้องคืน null ไม่ throw', () => {
    expect(resampleHistory([pt(10, '5')], 0, 100, 0)).toBeNull();
    expect(resampleHistory([pt(10, '5')], 100, 0, 4)).toBeNull();
  });
});
