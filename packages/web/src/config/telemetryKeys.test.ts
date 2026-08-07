import { describe, expect, it } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import {
  CLIMATE_KEY_RULES,
  LIVE_FIELDS,
  pickKey,
  resolveClimate,
  resolveSoil,
  unmatchedKeys,
} from './telemetryKeys';

/**
 * ตัวจับคู่ชื่อ key — จุดที่ตัดสินว่า "ต่อติดแล้วเห็นค่าจริง" หรือ "ต่อติดแล้วจอว่าง"
 *
 * เหตุผลที่ต้องมีตัวนี้: เอกสารเตือนว่าขอ key ที่สะกดไม่ตรงกับฝั่ง ThingsBoard
 * จะ**ไม่ error แต่ไม่มี event ส่งมาเลย** ซึ่งหน้าตาเหมือน device ตาย แยกไม่ออก
 * เราจึงขอทุก key แล้วจับคู่จากชื่อที่มาจริง — เทสนี้คุมว่าการจับคู่ไม่หลวมและไม่แข็งเกินไป
 */
const tv = (value: string): TelemetryValue => ({ value, timestamp: 1_700_000_000_000 });

const live = (obj: Record<string, string>): Record<string, TelemetryValue> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, tv(v)]));

describe('pickKey', () => {
  it('ไม่สนตัวพิมพ์และตัวคั่น — soil_moisture · soilMoisture · SOIL-MOISTURE คือตัวเดียวกัน', () => {
    for (const name of ['soil_moisture', 'soilMoisture', 'SOIL-MOISTURE', 'Soil Moisture']) {
      expect(pickKey([name], ['soil_moisture']), name).toBe(name);
    }
  });

  it('คืนชื่อจริงที่ device ใช้ ไม่ใช่ alias ที่เราตั้งไว้ — ต้องเอาไปอ่านค่าออกมาได้', () => {
    expect(pickKey(['airTemp'], ['temperature', 'temp', 'air_temperature', 'airTemp'])).toBe(
      'airTemp',
    );
  });

  it('เรียงตามลำดับความมั่นใจ — มีทั้ง temperature และ temp ต้องเลือก temperature', () => {
    expect(pickKey(['temp', 'temperature'], CLIMATE_KEY_RULES.temp.aliases)).toBe('temperature');
  });

  it('ไม่มีตัวไหนตรงเลยต้องคืน null ไม่ใช่เดาตัวที่ใกล้เคียง', () => {
    expect(pickKey(['pressure', 'battery'], CLIMATE_KEY_RULES.temp.aliases)).toBeNull();
  });
});

describe('resolveClimate', () => {
  it('แปลงค่าที่เป็น string ให้เป็นตัวเลข และบอกว่าใช้ key ชื่อไหน', () => {
    const r = resolveClimate(live({ temperature: '28.4', humidity: '71', brightness: '18.2' }));

    expect(r.values).toEqual({ temp: 28.4, rh: 71, lux: 18.2 });
    expect(r.matched).toEqual({ temp: 'temperature', rh: 'humidity', lux: 'brightness' });
  });

  it('ค่าที่ไม่มี key ตรงต้องไม่มีใน values เลย — ห้ามใส่ 0 แทน', () => {
    const r = resolveClimate(live({ temperature: '28.4' }));

    expect(Object.keys(r.values)).toEqual(['temp']);
    expect(r.values.rh).toBeUndefined();
  });

  it('ค่าที่แปลงเป็นตัวเลขไม่ได้ต้องถูกทิ้ง ไม่ใช่กลายเป็น NaN บนหน้าจอ', () => {
    const r = resolveClimate(live({ temperature: 'n/a', humidity: '' }));
    expect(r.values).toEqual({});
  });
});

describe('resolveSoil', () => {
  it('รับได้ทุกชื่อที่พบบ่อย', () => {
    expect(resolveSoil(live({ soil: '55' }))).toBe(55);
    expect(resolveSoil(live({ soil_moisture: '41.5' }))).toBe(41.5);
    expect(resolveSoil(live({ moisture: '60' }))).toBe(60);
  });

  it('ไม่มีเซนเซอร์ดินต้องคืน null — หน้าจอค่อยตัดสินใจว่าจะโชว์อะไร', () => {
    expect(resolveSoil(live({ temperature: '28' }))).toBeNull();
  });
});

describe('unmatchedKeys', () => {
  it('บอกชื่อ key ที่ device ส่งมาแต่ยังจับคู่ไม่ได้ — วิธีเดียวที่จะรู้ชื่อจริงโดยไม่เดา', () => {
    const got = unmatchedKeys(
      live({ temperature: '28', soil: '50', battery_level: '92', rssi: '-61' }),
    );
    expect([...got].sort()).toEqual(['battery_level', 'rssi']);
  });

  it('จับคู่ได้หมดก็ต้องว่าง', () => {
    expect(unmatchedKeys(live({ temperature: '28', humidity: '70' }))).toEqual([]);
  });
});

describe('LIVE_FIELDS', () => {
  it('คือค่าทั้งหมดที่หน้าจอต้องใช้ — ตัวหารของสัดส่วนบนป้ายสถานะ', () => {
    expect([...LIVE_FIELDS]).toEqual(['temp', 'rh', 'lux', 'soil']);
  });
});
