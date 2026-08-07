import { describe, expect, it } from 'vitest';
import { TH } from './th';
import { EN } from './en';
import { FARM_SCENE_KEYS } from './farmSceneKeys';

describe('พจนานุกรม TH / EN', () => {
  const thKeys = Object.keys(TH).sort();
  const enKeys = Object.keys(EN).sort();

  it('คีย์ตรงกันทุกตัวระหว่างสองภาษา', () => {
    expect(enKeys).toEqual(thKeys);
  });

  /**
   * ต้นแบบฉากเกมมี 168 คำ — เฟสหลังเพิ่มคำได้ แต่ห้ามทำของเดิมหาย (สเปกข้อ 7.4)
   * เคยล็อกไว้ที่ 168 เป๊ะตอนที่เหลือหน้าเดียว พอเอาแดชบอร์ดกลับมาจึงต้องผ่อน
   */
  it('คีย์ 168 ตัวจากฉากเกมยังอยู่ครบ', () => {
    expect(FARM_SCENE_KEYS).toHaveLength(168);
    const missing = FARM_SCENE_KEYS.filter((k) => !(k in TH));
    expect(missing, 'คีย์ของฉากเกมหายไป').toEqual([]);
  });

  /** คีย์ที่เพิ่มมาต้องมาเป็นคู่เสมอ ไม่ใช่ภาษาเดียว */
  it('คำที่เพิ่มหลังฉากเกมมีครบทั้งสองภาษา', () => {
    const farm = new Set<string>(FARM_SCENE_KEYS);
    const addedTh = thKeys.filter((k) => !farm.has(k));
    const addedEn = enKeys.filter((k) => !farm.has(k));
    expect(addedEn, 'คำที่เพิ่มมาไม่เท่ากันสองภาษา').toEqual(addedTh);
    expect(addedTh.length, 'ควรมีคำของหน้าแดชบอร์ดเพิ่มเข้ามา').toBeGreaterThan(0);
  });

  it('คีย์ชนิดเดียวกัน (string ↔ string, ฟังก์ชัน ↔ ฟังก์ชัน จำนวนพารามิเตอร์เท่ากัน)', () => {
    for (const key of thKeys) {
      const th = TH[key as keyof typeof TH];
      const en = EN[key as keyof typeof EN];
      expect(typeof en, `ชนิดของ "${key}" ไม่ตรงกัน`).toBe(typeof th);
      if (typeof th === 'function' && typeof en === 'function') {
        expect(en.length, `จำนวนพารามิเตอร์ของ "${key}" ไม่ตรงกัน`).toBe(th.length);
      }
    }
  });

  it('ไม่มีคำแปลว่าง', () => {
    // zonePrefix ในภาษาอังกฤษเป็นค่าว่างโดยตั้งใจ (ไม่มีคำนำหน้าชื่อโซน)
    const allowEmpty = new Set(['zonePrefix']);
    for (const key of thKeys) {
      if (allowEmpty.has(key)) continue;
      const th = TH[key as keyof typeof TH];
      const en = EN[key as keyof typeof EN];
      if (typeof th === 'string') expect(th.length, `"${key}" ภาษาไทยว่าง`).toBeGreaterThan(0);
      if (typeof en === 'string') expect(en.length, `"${key}" ภาษาอังกฤษว่าง`).toBeGreaterThan(0);
    }
  });
});
