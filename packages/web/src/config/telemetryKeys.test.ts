import { describe, expect, it } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import {
  CLIMATE_KEY_RULES,
  LIVE_FIELDS,
  SOIL_ALIASES,
  TELEMETRY_KEYS,
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

/**
 * 🔴 รายชื่อ key ที่ส่งไปกับ `subscribe_telemetry`
 *
 * เอกสาร `WEBSOCKET_API.md` เขียนว่า "ไม่ส่ง `keys` = รับทุก key ที่ device ยิงมา"
 * **ทดสอบกับ backend จริง 2026-08-17 แล้วไม่จริง** — ไม่ส่ง `keys` ฟัง 90 วินาที
 * ได้ `telemetry_data` 0 ครั้ง (ขณะที่ `attribute_data` มาทุก 10 วินาทีปกติ)
 * อาการที่ผู้ใช้เห็นคือ header ค้างที่ "ต่อติดแล้ว รอค่า…" ตลอดไป
 */
describe('TELEMETRY_KEYS — รายชื่อที่ต้องส่งไปขอ', () => {
  it('มีชื่อจริงของค่าที่หน้าจอแสดงครบทั้ง 4 ค่า', () => {
    // ชื่อจริงจากหน้า Latest telemetry ของ ThingsBoard (device `handysense-farm`)
    for (const k of ['temperature', 'humidity', 'light', 'soil_moisture']) {
      expect(TELEMETRY_KEYS, `ขาด ${k} = ค่านั้นจะไม่มีวันขึ้นบนจอ`).toContain(k);
    }
  });

  it('มี cmd_result — ขาดแล้วสั่งอุปกรณ์จริงแล้วไม่มีวันรู้ผล', () => {
    expect(TELEMETRY_KEYS).toContain('cmd_result');
  });

  it('มี netpie_banned — ขาดแล้วอุปกรณ์ถูกระงับก็ยังกดปุ่มได้ทั้งที่คำสั่งไม่ถึง', () => {
    expect(TELEMETRY_KEYS).toContain('netpie_banned');
  });

  /**
   * 🔴 backend ตอบกลับ **ทุก key ที่ขอ** — ตัวที่อุปกรณ์ไม่มีได้ `value: null` พร้อม timestamp สด
   * ถ้ายัด alias ทั้งชุดลงไป `brightness` (null) จะถูกเจอก่อน `light` (มีค่า) แล้วค่าหาย
   */
  it('ห้ามมี alias ที่อุปกรณ์ไม่มีจริงปนอยู่ — จะไปบังชื่อจริงจนค่าหาย', () => {
    const decoys = ['brightness', 'lux', 'soil', 'moisture', 'temp', 'rh', 'hum'];
    expect(TELEMETRY_KEYS.filter((k) => decoys.includes(k))).toEqual([]);
  });

  it('ทุกชื่อที่ขอต้องอยู่ในตาราง alias หรือเป็น key ที่ใช้งานจริง', () => {
    const known = new Set<string>([
      ...Object.values(CLIMATE_KEY_RULES).flatMap((r) => r.aliases),
      ...SOIL_ALIASES,
      'cmd_result',
      'netpie_banned',
      'netpie_enabled',
      'netpie_status',
    ]);
    expect(TELEMETRY_KEYS.filter((k) => !known.has(k))).toEqual([]);
  });
});

describe('key ที่ backend ตอบมาแต่ไม่มีค่า (value: null)', () => {
  const withNulls = {
    // ชุดที่เกิดขึ้นจริงถ้าขอ alias ครบทุกตัว — เรียงให้ตัวหลอกมาก่อนตัวจริง
    brightness: { value: null, timestamp: 2_000_000_000_000 },
    light: { value: '6.63', timestamp: 1_700_000_000_000 },
    soil: { value: null, timestamp: 2_000_000_000_000 },
    soil_moisture: { value: '99', timestamp: 1_700_000_000_000 },
  } as unknown as Record<string, TelemetryValue>;

  it('ต้องข้ามตัวที่ไม่มีค่า แล้วไปเอา alias ตัวถัดไปที่มีค่าจริง', () => {
    expect(resolveClimate(withNulls).values.lux, 'brightness เป็น null ต้องไม่บัง light').toBe(
      6.63,
    );
    expect(resolveSoil(withNulls), 'soil เป็น null ต้องไม่บัง soil_moisture').toBe(99);
  });

  it('จับคู่ได้ชื่อจริง ไม่ใช่ชื่อที่ว่างเปล่า', () => {
    expect(resolveClimate(withNulls).matched.lux).toBe('light');
  });
});
