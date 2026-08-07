import { TARGET_BANDS } from './chart';
import type { MetricKey, Pt } from './chart';

/**
 * การคำนวณสเกลของกราฟประวัติ แยกออกจาก UI เพื่อให้เทสได้ตรงๆ
 *
 * หัวใจคือ **สเกลแยกต่อเส้น**: เวลาแสดง 4 ค่าพร้อมกัน ห้ามยัดทุกค่าลงแกน 0–100 เดียวกัน
 * ไม่งั้นเส้นแสง (0–55) กับความชื้นดิน (24) จะแบนติดพื้น มองไม่เห็นการเปลี่ยนแปลง
 */

export interface Extent {
  readonly min: number;
  readonly max: number;
}

export interface Plot {
  readonly width: number;
  readonly height: number;
  readonly padLeft: number;
  readonly padRight: number;
  readonly top: number;
  readonly bottom: number;
}

/** สัดส่วนช่องว่างบน-ล่างที่เผื่อให้เส้นไม่ชนขอบ (18% ของช่วงค่า) */
export const SERIES_PADDING = 0.18;

/**
 * ช่วงค่าของเส้นหนึ่ง พร้อมช่องว่างหัวท้าย
 * ถ้าค่าคงที่ทั้งเส้น (เช่นเซนเซอร์ค้าง) จะได้ช่วงกว้าง 1 กันหารศูนย์
 */
export function seriesExtent(values: readonly number[], pad = SERIES_PADDING): Extent {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const gap = span * pad;
  return { min: lo - gap, max: hi + gap };
}

/** ช่วงค่ารวมของหลายชุด — ใช้ตอนเลือก "รวมแกนเดียว" */
export function combinedExtent(...groups: readonly (readonly number[])[]): Extent {
  const all = groups.flat();
  if (all.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...all), max: Math.max(...all) };
}

/**
 * แกนของกราฟค่าเดียว
 * `splitAxis` = true → ซูมเข้าช่วงค่าจริง · false → ใช้แกนคงที่ 0–100 เทียบข้ามค่าได้
 */
export function axisExtent(values: readonly number[], splitAxis: boolean): Extent {
  return splitAxis ? combinedExtent(values) : { min: 0, max: 100 };
}

/** แปลงดัชนี → พิกัด x (กินเต็มความกว้างเสมอ ไม่กระจุกฝั่งใดฝั่งหนึ่ง) */
export function xAt(index: number, count: number, plot: Plot): number {
  if (count <= 1) return plot.padLeft;
  return plot.padLeft + (index * (plot.width - plot.padLeft - plot.padRight)) / (count - 1);
}

/** แปลงค่า → พิกัด y (ค่ามากอยู่บน) */
export function yAt(value: number, extent: Extent, plot: Plot): number {
  const span = extent.max - extent.min || 1;
  return plot.top + (plot.bottom - plot.top) * (1 - (value - extent.min) / span);
}

/** แปลงทั้งชุดเป็นจุดบนผืนกราฟ */
export function toPoints(values: readonly number[], extent: Extent, plot: Plot): Pt[] {
  return values.map<Pt>((v, i) => [xAt(i, values.length, plot), yAt(v, extent, plot)]);
}

export interface BandBox {
  readonly y: number;
  readonly height: number;
  readonly visible: boolean;
}

/**
 * กล่องของ "ช่วงค่าเหมาะสม" บนผืนกราฟ — **ยาวเต็มความกว้างเสมอ**
 * ถ้าช่วงเป้าหมายหลุดออกนอกแกนที่กำลังแสดง จะคืน `visible: false` แทนการวาดแถบเพี้ยน
 */
export function targetBandBox(metric: MetricKey, extent: Extent, plot: Plot): BandBox {
  const [lo, hi] = TARGET_BANDS[metric];
  const clampedHi = Math.min(extent.max, hi);
  const clampedLo = Math.max(extent.min, lo);
  const yHi = yAt(clampedHi, extent, plot);
  const yLo = yAt(clampedLo, extent, plot);
  return { y: yHi, height: yLo - yHi, visible: yLo > yHi };
}

/**
 * สร้างผืนกราฟจากความกว้างจริงเป็นพิกเซล — 1 หน่วยใน SVG = 1px
 * `padRight` เผื่อไว้เขียนตัวเลขแกน Y (กราฟหลายเส้นไม่มีตัวเลขแกน จึงส่งค่าน้อยๆ มา)
 */
export function pixelPlot(width: number, height: number, padRight: number): Plot {
  return { width, height, padLeft: 14, padRight, top: 26, bottom: height - 18 };
}

/** ความสูงของกราฟตามความกว้างที่มี — เตี้ยลงบนจอแคบแต่ไม่ต่ำกว่า 210px */
export const chartHeightFor = (width: number): number =>
  Math.round(Math.min(300, Math.max(210, width * 0.36)));

/**
 * ดัชนีจุดที่ใกล้ตำแหน่ง x ที่สุด — ใช้ตอนเลื่อนเมาส์เพื่อโชว์ค่า
 * คืน `null` เมื่อไม่มีข้อมูล จะได้ไม่ต้องเดาว่า 0 แปลว่าอะไร
 */
export function nearestIndex(x: number, count: number, plot: Plot): number | null {
  if (count <= 0) return null;
  if (count === 1) return 0;
  const span = plot.width - plot.padLeft - plot.padRight;
  const ratio = (x - plot.padLeft) / (span || 1);
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
}

/** ค่าที่ต้องเขียนกำกับบนแกน Y (บนลงล่าง 5 ขีด) */
export function axisTicks(extent: Extent, steps: readonly number[] = [0, 0.25, 0.5, 0.75, 1]) {
  const span = extent.max - extent.min || 1;
  return steps.map((f) => ({ fraction: f, value: extent.max - span * f }));
}
