import { describe, expect, it } from 'vitest';
import { ZONE_IDS } from '@shared/zone';
import { ZONE_GEOMETRY } from './zones';
import { BULBS, STEAM } from './bulbs';
import { SCENE_AR } from '@/lib/sceneRect';

/**
 * ค่าคาลิเบรตเหล่านี้วัดกับภาพจริงมาแล้ว — สเปกข้อ 7.2 ห้ามเปลี่ยน
 * เทสนี้ทำหน้าที่เป็นตัวล็อก ถ้าใครแก้ตัวเลขจะแดงทันที
 */
describe('ค่าคาลิเบรตของฉาก', () => {
  it('พิกัด 8 โซนตรงกับต้นแบบทุกตัว', () => {
    expect(ZONE_GEOMETRY).toEqual({
      kale: { box: [24, 33, 16, 15], dot: [32, 41] },
      flower: { box: [42, 33, 16, 15], dot: [50, 40] },
      rosemary: { box: [60, 33, 17, 15], dot: [67.5, 40] },
      mushroom: { box: [11, 49, 15, 21], dot: [19, 59] },
      lettuce: { box: [36, 49, 34, 14], dot: [53, 56] },
      cucumber: { box: [24, 61, 17, 29], dot: [33, 76] },
      strawberry: { box: [46, 62, 16, 28], dot: [54, 77] },
      tomato: { box: [65, 59, 21, 30], dot: [75, 73] },
    });
  });

  it('มีครบ 8 โซนตาม ZONE_IDS', () => {
    expect(Object.keys(ZONE_GEOMETRY).sort()).toEqual([...ZONE_IDS].sort());
  });

  it('ทุกหมุดอยู่ในกรอบแปลงของตัวเอง', () => {
    for (const id of ZONE_IDS) {
      const { box, dot } = ZONE_GEOMETRY[id];
      expect(dot[0], `${id} หมุดหลุดกรอบแนวนอน`).toBeGreaterThanOrEqual(box[0]);
      expect(dot[0], `${id} หมุดหลุดกรอบแนวนอน`).toBeLessThanOrEqual(box[0] + box[2]);
      expect(dot[1], `${id} หมุดหลุดกรอบแนวตั้ง`).toBeGreaterThanOrEqual(box[1]);
      expect(dot[1], `${id} หมุดหลุดกรอบแนวตั้ง`).toBeLessThanOrEqual(box[1] + box[3]);
    }
  });

  it('หลอดไฟ 7 ดวงและไอน้ำ 3 จุดตรงกับต้นแบบ', () => {
    expect(BULBS).toEqual([
      [20.5, 29],
      [31, 21.5],
      [38, 15],
      [50, 17.5],
      [62, 14.5],
      [69.5, 20.5],
      [79.5, 26.5],
    ]);
    expect(STEAM).toEqual([
      [32, 36],
      [53, 50],
      [74, 66],
    ]);
  });

  it('สัดส่วนฉากคือ 1760 × 1097', () => {
    expect(SCENE_AR).toBeCloseTo(1760 / 1097, 10);
  });
});
