import { METRIC_CFG, RANGE_POINTS, seriesFor } from '@/lib/chart';
import type { MetricKey, RangeKey } from '@/lib/chart';

/**
 * ประวัติค่าเซนเซอร์จำลอง — deterministic ล้วน (ไม่มี Math.random)
 * กราฟจึงไม่กระโดดตอน re-render และเทสตรวจค่าได้แน่นอน
 *
 * เมื่อต่อ ThingsBoard จริงในเฟส 5 ให้เปลี่ยนแค่ `historyFor()` ให้ไปดึงของจริง
 * โดย signature คงเดิม UI ไม่ต้องแก้
 */
export const historyFor = (metric: MetricKey, range: RangeKey): readonly number[] =>
  seriesFor(metric, range);

/** ทุกค่าในช่วงเวลาเดียวกัน — ใช้ตอนแสดง 4 เส้นพร้อมกัน */
export function allHistory(range: RangeKey): Readonly<Record<MetricKey, readonly number[]>> {
  return {
    temp: historyFor('temp', range),
    hum: historyFor('hum', range),
    soil: historyFor('soil', range),
    light: historyFor('light', range),
  };
}

/** ลำดับเส้นที่วาดในโหมด "ทุกค่ารวม" */
export const ALL_SERIES_ORDER: readonly MetricKey[] = ['temp', 'hum', 'soil', 'light'];

/** จำนวนจุดของช่วงเวลานั้น (ให้ UI ไม่ต้องรู้จัก RANGE_POINTS โดยตรง) */
export const pointsIn = (range: RangeKey): number => RANGE_POINTS[range];

/** ค่าปัจจุบันที่โชว์เป็นตัวเลขใหญ่เหนือกราฟ */
export const currentLabel = (metric: MetricKey): string => METRIC_CFG[metric].current;

/** เส้นแนวโน้มย่อในการ์ดเซนเซอร์ (8 จุดล่าสุด) */
export const SENSOR_SPARKLINES: Readonly<Record<MetricKey, readonly number[]>> = {
  temp: [30, 31, 30, 32, 33, 32, 31, 31],
  soil: [27, 26, 25, 24, 24, 24, 24, 24],
  light: [38, 44, 41, 48, 45, 43, 46, 42],
  hum: [58, 60, 59, 63, 61, 62, 64, 62],
};
