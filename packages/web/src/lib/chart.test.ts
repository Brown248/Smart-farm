import { describe, expect, it } from 'vitest';
import {
  METRIC_CFG,
  METRIC_KEYS,
  RANGE_KEYS,
  RANGE_POINTS,
  TARGET_BANDS,
  csvFilename,
  pointTimeLabel,
  previousSeries,
  seriesFor,
  smoothPath,
  toCsv,
} from './chart';

describe('pointTimeLabel — ป้ายเวลาต่อจุดบน tooltip', () => {
  const NOW = new Date('2026-08-06T14:00:00+07:00'); // 14:00 เวลาไทย (พฤหัส)

  it('จุดสุดท้าย = เวลาปัจจุบัน · ชม./วัน แสดง HH:mm', () => {
    expect(pointTimeLabel(23, 24, 'day', 'en', NOW)).toBe('14:00');
    expect(pointTimeLabel(12, 13, 'hour', 'en', NOW)).toBe('14:00');
  });

  it('จุดก่อนหน้าเวลาถอยหลังตามช่วง (ชม.: จุดแรก = 1 ชม.ก่อน)', () => {
    expect(pointTimeLabel(0, 13, 'hour', 'en', NOW)).toBe('13:00');
  });

  it('รูปแบบต่างกันตามช่วง — สัปดาห์มีเวลา · เดือน/ปี มีชื่อเดือน', () => {
    expect(pointTimeLabel(27, 28, 'week', 'en', NOW)).toMatch(/\d{2}:\d{2}/);
    expect(pointTimeLabel(29, 30, 'month', 'en', NOW)).toMatch(/[A-Za-z]/);
    expect(pointTimeLabel(25, 26, 'year', 'en', NOW)).toMatch(/[A-Za-z]/);
  });
});

describe('ข้อมูลกราฟ', () => {
  it('จำนวนจุดตรงกับช่วงเวลาที่เลือก', () => {
    for (const range of RANGE_KEYS) {
      for (const metric of METRIC_KEYS) {
        expect(seriesFor(metric, range)).toHaveLength(RANGE_POINTS[range]);
      }
    }
  });

  it('ผลลัพธ์คงที่ทุกครั้ง (ไม่มีการสุ่ม) — กราฟจึงไม่กระโดดตอน re-render', () => {
    expect(seriesFor('temp', 'day')).toEqual(seriesFor('temp', 'day'));
    expect(seriesFor('light', 'week')).toEqual(seriesFor('light', 'week'));
  });

  it('ความชื้นดินค้างที่ 24% ในช่วงท้าย — สื่อว่าเซนเซอร์ไม่ขยับ', () => {
    const arr = seriesFor('soil', 'day');
    const tail = arr.slice(-3);
    expect(tail).toEqual([24, 24, 24]);
    expect(new Set(arr.slice(0, 5)).size).toBeGreaterThan(1);
  });

  it('ทุกค่ามีสี หน่วย และช่วงเหมาะสมครบ', () => {
    for (const metric of METRIC_KEYS) {
      expect(METRIC_CFG[metric].color).toMatch(/^var\(--d-m-/);
      expect(METRIC_CFG[metric].unit.length).toBeGreaterThan(0);
      const [lo, hi] = TARGET_BANDS[metric];
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('ชุดข้อมูลช่วงก่อนหน้ามีความยาวเท่าเดิมและต่ำกว่าเสมอ', () => {
    const arr = seriesFor('temp', 'day');
    const prev = previousSeries(arr);
    expect(prev).toHaveLength(arr.length);
    arr.forEach((v, i) => expect(prev[i]).toBeLessThan(v));
  });
});

describe('smoothPath', () => {
  it('จุดน้อยกว่า 2 จุดคืนค่าว่าง', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[0, 0]])).toBe('');
  });

  it('เริ่มด้วย M แล้วตามด้วยเส้นโค้ง C ตามจำนวนช่วง', () => {
    const d = smoothPath([
      [0, 0],
      [10, 5],
      [20, 0],
    ]);
    expect(d.startsWith('M0.00,0.00')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it('โหมดปิดรูปลากกลับไปที่เส้นฐานและปิดด้วย Z', () => {
    const d = smoothPath(
      [
        [0, 10],
        [10, 4],
      ],
      true,
      100,
    );
    expect(d).toContain('L10.00,100');
    expect(d.trim().endsWith('Z')).toBe(true);
  });
});

describe('ส่งออก CSV', () => {
  it('มีหัวตารางและหนึ่งแถวต่อหนึ่งจุด', () => {
    const csv = toCsv('temp', [1.234, 5.678]);
    expect(csv.split('\n')).toEqual(['index,temp', '0,1.23', '1,5.68']);
  });

  it('ชื่อไฟล์บอกค่าและช่วงเวลาที่กำลังดู', () => {
    expect(csvFilename('soil', 'week')).toBe('syntech-soil-week.csv');
  });
});
