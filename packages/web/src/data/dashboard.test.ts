import { describe, expect, it } from 'vitest';
import { ZONE_IDS } from '@shared/zone';
import {
  DASH_ZONES,
  DEFAULT_THRESHOLDS,
  HERO_STATS,
  SENSOR_DEFS,
  SOIL_STUCK_VALUE,
  levelFor,
} from './dashboard';

describe('ข้อมูลแดชบอร์ด', () => {
  it('โซน A–H ผูกกับ 8 โซนเดียวกับฉากเกม ไม่ซ้ำไม่ขาด', () => {
    expect(DASH_ZONES).toHaveLength(8);
    expect(DASH_ZONES.map((z) => z.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect([...DASH_ZONES.map((z) => z.zoneId)].sort()).toEqual([...ZONE_IDS].sort());
  });

  it('จำนวนโซนในการ์ดภาพรวมตรงกับจำนวนโซนจริง', () => {
    expect(HERO_STATS.totalZones).toBe(DASH_ZONES.length);
  });

  it('มีเซนเซอร์ 4 ตัว และมีเพียงตัวเดียวที่ค่าค้าง', () => {
    expect(SENSOR_DEFS).toHaveLength(4);
    const stale = SENSOR_DEFS.filter((d) => d.stale);
    expect(stale).toHaveLength(1);
    expect(stale[0]?.key).toBe('soil');
  });
});

describe('เกณฑ์แจ้งเตือน', () => {
  it('ต่ำกว่าเกณฑ์วิกฤต = วิกฤต', () => {
    expect(levelFor(15, { warn: 30, crit: 20 })).toBe('crit');
  });

  it('อยู่ระหว่างเกณฑ์วิกฤตกับเกณฑ์เตือน = เตือน', () => {
    expect(levelFor(24, { warn: 30, crit: 20 })).toBe('warn');
  });

  it('ถึงเกณฑ์เตือนพอดี = ปกติ', () => {
    expect(levelFor(30, { warn: 30, crit: 20 })).toBe('normal');
  });

  it('เกณฑ์ตั้งต้นให้ผลตรงกับสถานะในต้นแบบ', () => {
    // ดินโซน B ค้างที่ 24% → ต้องขึ้นสถานะเตือน
    expect(levelFor(SOIL_STUCK_VALUE, DEFAULT_THRESHOLDS.soil)).toBe('warn');
    // อีกสามตัวอยู่ในเกณฑ์ปกติ
    expect(levelFor(31, DEFAULT_THRESHOLDS.temp)).toBe('normal');
    expect(levelFor(42, DEFAULT_THRESHOLDS.light)).toBe('normal');
    expect(levelFor(62, DEFAULT_THRESHOLDS.hum)).toBe('normal');
  });
});
