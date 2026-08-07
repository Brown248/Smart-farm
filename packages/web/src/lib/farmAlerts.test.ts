import { describe, expect, it } from 'vitest';
import type { ClimateValues } from '@shared/sensor';
import { deriveSensorAlerts } from './farmAlerts';
import type { AlertMetric } from './farmAlerts';

const ALL = new Set<AlertMetric>(['temp', 'rh', 'lux', 'soil']);

/**
 * แจ้งเตือนจากค่าจริง — ใช้ค่าจริงของ handysense-farm เป็นหลัก
 * (temp 36.29 · rh 72 · lux 3.23 · soil 99 → ร้อนเกิน · แสงน้อย · ดินเปียกเกิน)
 */
const soilTh = { warn: 30, crit: 20 };
const climate = (o: Partial<ClimateValues>): ClimateValues => ({
  temp: 27,
  rh: 70,
  lux: 30,
  ...o,
});

describe('deriveSensorAlerts', () => {
  it('ค่าอยู่ในเกณฑ์ทั้งหมด → ไม่มีแจ้งเตือน', () => {
    expect(deriveSensorAlerts(climate({}), 55, soilTh, ALL)).toEqual([]);
  });

  it('อุณหภูมิสูงเกินช่วง → เตือน dir high', () => {
    const a = deriveSensorAlerts(climate({ temp: 36.29 }), 55, soilTh, ALL);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ metric: 'temp', dir: 'high', value: 36.29 });
  });

  it('แสงน้อยกว่าช่วง → เตือน dir low', () => {
    const a = deriveSensorAlerts(climate({ lux: 3.23 }), 55, soilTh, ALL);
    expect(a[0]).toMatchObject({ metric: 'lux', dir: 'low' });
  });

  it('ดินแห้งต่ำกว่า crit → วิกฤต · ต่ำกว่า warn → เตือน · เปียกเกิน → เตือน high', () => {
    expect(deriveSensorAlerts(climate({}), 15, soilTh, ALL)[0]).toMatchObject({
      metric: 'soil',
      level: 'crit',
      dir: 'low',
    });
    expect(deriveSensorAlerts(climate({}), 25, soilTh, ALL)[0]).toMatchObject({
      metric: 'soil',
      level: 'warn',
      dir: 'low',
    });
    expect(deriveSensorAlerts(climate({}), 99, soilTh, ALL)[0]).toMatchObject({
      metric: 'soil',
      dir: 'high',
    });
  });

  it('ไม่มีเซนเซอร์ดิน (null) → ไม่เตือนเรื่องดิน', () => {
    expect(deriveSensorAlerts(climate({}), null, soilTh, ALL)).toEqual([]);
  });

  it('วิกฤตต้องมาก่อนเตือนเสมอในรายการ', () => {
    // temp 33 = เกิน hi 32 เล็กน้อย → warn · ดินแห้ง 15 → crit · crit ต้องขึ้นก่อน
    const a = deriveSensorAlerts(climate({ temp: 33 }), 15, soilTh, ALL);
    expect(a[0]?.level).toBe('crit');
    expect(a.map((x) => x.level)).toEqual(['crit', 'warn']);
  });

  it('ค่าจริงของ handysense-farm → เตือน 3 อย่าง (ร้อน · แสงน้อย · ดินเปียก)', () => {
    const a = deriveSensorAlerts({ temp: 36.29, rh: 72, lux: 3.23 }, 99, soilTh, ALL);
    const metrics = a.map((x) => x.metric).sort();
    expect(metrics).toEqual(['lux', 'soil', 'temp']);
  });

  it('ค่าที่ยังไม่ใช่ของจริง (ไม่อยู่ใน liveFields) ต้องไม่เตือน — กันเตือนจากค่าจำลอง', () => {
    // อุณหภูมิสูงมากแต่ไม่มีเซนเซอร์จริง (liveFields ว่าง) → ต้องไม่เตือน
    expect(deriveSensorAlerts(climate({ temp: 40 }), null, soilTh, new Set())).toEqual([]);
    // มีแต่ lux จริง → เตือนแค่ lux แม้ temp จะสูง
    const a = deriveSensorAlerts(climate({ temp: 40, lux: 3 }), null, soilTh, new Set(['lux']));
    expect(a.map((x) => x.metric)).toEqual(['lux']);
  });
});
