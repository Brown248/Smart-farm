import { describe, expect, it } from 'vitest';
import {
  axisExtent,
  axisTicks,
  combinedExtent,
  seriesExtent,
  targetBandBox,
  toPoints,
  xAt,
  yAt,
} from './chartScale';
import type { Plot } from './chartScale';
import { allHistory } from '@/data/mockSensorHistory';

const PLOT: Plot = { width: 720, height: 300, padLeft: 12, padRight: 52, top: 20, bottom: 266 };

describe('seriesExtent — สเกลแยกต่อเส้น', () => {
  it('เผื่อช่องว่างหัวท้าย 18% ของช่วงค่า', () => {
    const e = seriesExtent([10, 20]);
    expect(e.min).toBeCloseTo(10 - 1.8, 6);
    expect(e.max).toBeCloseTo(20 + 1.8, 6);
  });

  it('ค่าคงที่ทั้งเส้น (เซนเซอร์ค้าง) ไม่ทำให้หารศูนย์', () => {
    const e = seriesExtent([24, 24, 24]);
    expect(e.max).toBeGreaterThan(e.min);
    expect(Number.isFinite(e.min)).toBe(true);
  });

  it('ชุดว่างคืนช่วงปลอดภัย', () => {
    expect(seriesExtent([])).toEqual({ min: 0, max: 1 });
  });
});

describe('4 ค่าพร้อมกัน — แต่ละเส้นต้องใช้สเกลของตัวเอง', () => {
  const data = allHistory('day');

  it('ช่วงค่าของแต่ละเส้นไม่เท่ากัน (ไม่ได้ยัดลงแกนเดียว)', () => {
    const soil = seriesExtent(data.soil);
    const light = seriesExtent(data.light);
    const temp = seriesExtent(data.temp);
    expect(soil.max).not.toBeCloseTo(light.max, 3);
    expect(temp.max).not.toBeCloseTo(light.max, 3);
  });

  it('ทุกเส้นกินความสูงของผืนกราฟใกล้เคียงกัน — ไม่มีเส้นไหนแบนติดขอบ', () => {
    for (const values of Object.values(data)) {
      const pts = toPoints(values, seriesExtent(values), PLOT);
      const ys = pts.map((p) => p[1]);
      const used = Math.max(...ys) - Math.min(...ys);
      const available = PLOT.bottom - PLOT.top;
      // ใช้พื้นที่แนวตั้งอย่างน้อย 55% ของผืนกราฟ
      expect(used / available).toBeGreaterThan(0.55);
    }
  });

  it('ถ้าบังคับใช้แกนเดียว 0–100 เส้นความชื้นดินจะแบนจนอ่านไม่ออก (เหตุผลที่ต้องแยกสเกล)', () => {
    const flat = toPoints(data.soil, { min: 0, max: 100 }, PLOT).map((p) => p[1]);
    const used = Math.max(...flat) - Math.min(...flat);
    expect(used / (PLOT.bottom - PLOT.top)).toBeLessThan(0.1);
  });
});

describe('พิกัดบนผืนกราฟ', () => {
  it('จุดแรกชิดขอบซ้าย จุดสุดท้ายชิดขอบขวา — เส้นกินเต็มความกว้าง', () => {
    const pts = toPoints([1, 2, 3, 4], seriesExtent([1, 2, 3, 4]), PLOT);
    expect(pts[0]?.[0]).toBeCloseTo(PLOT.padLeft, 6);
    expect(pts[pts.length - 1]?.[0]).toBeCloseTo(PLOT.width - PLOT.padRight, 6);
  });

  it('จุดเดียวไม่ทำให้หารศูนย์', () => {
    expect(xAt(0, 1, PLOT)).toBe(PLOT.padLeft);
  });

  it('ค่ามากอยู่บน ค่าน้อยอยู่ล่าง', () => {
    const e = { min: 0, max: 10 };
    expect(yAt(10, e, PLOT)).toBeLessThan(yAt(0, e, PLOT));
  });
});

describe('axisExtent', () => {
  it('แยกแกน = ซูมเข้าช่วงค่าจริง', () => {
    expect(axisExtent([30, 40], true)).toEqual({ min: 30, max: 40 });
  });

  it('รวมแกนเดียว = 0–100 เสมอ', () => {
    expect(axisExtent([30, 40], false)).toEqual({ min: 0, max: 100 });
  });

  it('combinedExtent ครอบทุกชุดที่ส่งเข้ามา', () => {
    expect(combinedExtent([5, 9], [1, 20])).toEqual({ min: 1, max: 20 });
  });
});

describe('targetBandBox — ช่วงค่าเหมาะสม', () => {
  it('อยู่ในกรอบและสูงเป็นบวกเมื่อช่วงเป้าหมายอยู่ในแกน', () => {
    // ช่วงเหมาะสมของอุณหภูมิคือ 22–32
    const band = targetBandBox('temp', { min: 20, max: 40 }, PLOT);
    expect(band.visible).toBe(true);
    expect(band.height).toBeGreaterThan(0);
    expect(band.y).toBeGreaterThanOrEqual(PLOT.top);
    expect(band.y + band.height).toBeLessThanOrEqual(PLOT.bottom + 0.001);
  });

  it('ซ่อนแถบเมื่อช่วงเป้าหมายหลุดออกนอกแกนที่แสดงอยู่', () => {
    const band = targetBandBox('temp', { min: 90, max: 100 }, PLOT);
    expect(band.visible).toBe(false);
  });
});

describe('axisTicks', () => {
  it('ไล่จากค่าสูงลงต่ำ 5 ขีด', () => {
    const ticks = axisTicks({ min: 0, max: 100 });
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.value).toBe(100);
    expect(ticks[4]?.value).toBe(0);
  });
});
