import { describe, expect, it } from 'vitest';
import { METRIC_KEYS, seriesFor } from './chart';
import type { MetricKey } from './chart';

/**
 * โหมด "ทุกค่ารวม" วาด 4 เส้น โดย **normalize แต่ละเส้นตามช่วงค่าของตัวเอง**
 *
 * บั๊กที่จับ: เดิม temp/hum/light ใช้รูปคลื่นเดียวกัน (ต่างแค่ base/amp) พอ normalize
 * แล้ว base/amp หายไป → 3 เส้นทับกันสนิท เห็นเป็นเส้นเดียว รวม soil = แค่ 2 เส้น
 * เทสนี้กันไม่ให้กลับไปใช้คลื่นซ้ำกันอีก
 */
function normalize(arr: readonly number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  return arr.map((v) => (v - min) / span);
}

const dist = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, v, i) => sum + Math.abs(v - (b[i] ?? 0)), 0) / a.length;

describe('เส้นกราฟทั้ง 4 ต่างกันจริง (บั๊ก 2 เส้น)', () => {
  it('normalize แล้วทุกคู่ยังต่างกันชัดเจน — ไม่มีคู่ไหนทับกัน', () => {
    const norm = Object.fromEntries(
      METRIC_KEYS.map((k) => [k, normalize(seriesFor(k, 'day'))]),
    ) as Record<MetricKey, number[]>;

    for (let i = 0; i < METRIC_KEYS.length; i++) {
      for (let j = i + 1; j < METRIC_KEYS.length; j++) {
        const a = METRIC_KEYS[i]!;
        const b = METRIC_KEYS[j]!;
        // ต่างเฉลี่ยต่อจุด > 0.05 = แยกเส้นออกจากกันได้ด้วยตา (เดิมคู่ temp/hum/light = 0 เป๊ะ)
        expect(dist(norm[a], norm[b]), `${a} vs ${b}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('ทุก range วาดได้ 4 เส้นที่ไม่ทับกัน (ไม่ใช่แค่ day)', () => {
    for (const range of ['hour', 'week', 'month', 'year'] as const) {
      const t = normalize(seriesFor('temp', range));
      const h = normalize(seriesFor('hum', range));
      expect(dist(t, h), range).toBeGreaterThan(0.05);
    }
  });
});
