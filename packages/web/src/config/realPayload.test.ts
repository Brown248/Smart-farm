import { describe, expect, it } from 'vitest';
import { telemetryBoolean, telemetryNumber } from '@shared/telemetrySocket';
import type { HistoryPoint, TelemetryDataEvent } from '@shared/telemetrySocket';
import { resolveClimate, resolveSoil, unmatchedKeys } from './telemetryKeys';

/**
 * เทสจาก **payload จริงที่ backend ส่งมา** ไม่ใช่ที่เดาจากเอกสาร
 *
 * เก็บมาตอนต่อ `backend-prod.synexta.ai/telemetry` ด้วยบัญชีจริงและ device ที่มีสิทธิ์
 * (`ไซต์ A : Inverter 4` — โรงเรือนยังไม่มีสิทธิ์ ดู `docs/MIGRATION.md` เฟส 5)
 *
 * เหตุที่ต้องมี: เอกสารเขียนว่าค่าเป็น string ทุกตัว **แต่ของจริงส่ง `null` มาได้**
 * และ type เดิมประกาศ `value: string` → `telemetryNumber()` เรียก `null.trim()` แล้ว throw
 * ทั้ง `FarmStateProvider` = จอขาว เทสชุดนี้กันไม่ให้พลาดซ้ำ
 */

/** ตอบกลับจริงเมื่อขอ key ที่ device ไม่มี — ได้ key นั้นคืนพร้อม `value: null` */
const NULL_VALUES: TelemetryDataEvent = {
  deviceId: '6de3c7f2-9e63-4432-aeb3-5a9431e18d83',
  timestamp: 1785818759293,
  data: {
    soil_moistur: { value: null, timestamp: 1785818759291 },
    temperatur: { value: null, timestamp: 1785818759292 },
  },
};

/** ตอบกลับจริงในโหมดค้นหา (ไม่ส่ง `keys`) — ตัดมาบางส่วนจาก 91 key */
const DISCOVERY: TelemetryDataEvent = {
  deviceId: '6de3c7f2-9e63-4432-aeb3-5a9431e18d83',
  timestamp: 1785818596384,
  data: {
    active_power_kw: { value: '126.288', timestamp: 1785817793253 },
    avg_normalized: { value: '0.2', timestamp: 1781777700184 },
    current: { value: '557.8620000000001', timestamp: 1785817793253 },
    daily_yield_kwh: { value: '341.48', timestamp: 1785817793253 },
    device_status: { value: '512', timestamp: 1785817793253 },
    internal_temp_c: { value: '41.3', timestamp: 1785817793253 },
  },
};

/** `history_data` จริง — **เรียงจากใหม่ไปเก่า** และ `value` เป็น string */
const HISTORY: readonly HistoryPoint[] = [
  { ts: 1785818693223, value: '78.52' },
  { ts: 1785817793253, value: '126.288' },
  { ts: 1785816893244, value: '135.339' },
  { ts: 1785815993255, value: '161.31' },
];

describe('ตัวแปลงค่ากับ payload จริง', () => {
  /*
   * ข้อนี้เคยพังจริง: `telemetryNumber(null)` → TypeError: Cannot read properties of null
   * type บอกว่าเป็น string เลยไม่มีใครกัน null แต่ server ส่ง null มาจริง
   */
  it('value เป็น null ต้องได้ null ไม่ใช่ throw', () => {
    expect(telemetryNumber(null)).toBeNull();
    expect(telemetryBoolean(null)).toBeNull();
    expect(() => telemetryNumber(NULL_VALUES.data['temperatur']?.value)).not.toThrow();
  });

  it('แปลงเลขที่เป็น string ได้ตรง รวมทศนิยมยาว', () => {
    expect(telemetryNumber('126.288')).toBe(126.288);
    expect(telemetryNumber('557.8620000000001')).toBe(557.8620000000001);
    expect(telemetryNumber('512')).toBe(512);
  });
});

describe('การจับคู่ key กับ payload จริง', () => {
  /**
   * นี่คือหัวใจของ "โหมดค้นหา" — device ตัวนี้เป็นอินเวอร์เตอร์โซลาร์ ไม่มีค่าโรงเรือนเลย
   * ต้องไม่จับคู่ผิดตัว (เช่น `internal_temp_c` ไม่ใช่อุณหภูมิอากาศในโรงเรือน)
   */
  it('device ที่ไม่ใช่โรงเรือน → ต้องไม่จับคู่ค่าไหนเลย', () => {
    const r = resolveClimate(DISCOVERY.data);

    expect(r.values).toEqual({});
    expect(resolveSoil(DISCOVERY.data)).toBeNull();
  });

  it('key ที่ไม่รู้จักทั้งหมดต้องโผล่ใน unmatched ครบ', () => {
    expect(unmatchedKeys(DISCOVERY.data).length).toBe(Object.keys(DISCOVERY.data).length);
  });

  /*
   * เคสนี้อันตรายที่สุด: ชื่อ key ตรงกับ alias แต่ค่าเป็น null
   * ถ้านับว่า "ได้ค่าจริงแล้ว" หน้าจอจะติดป้าย "ค่าจริง" บนช่องที่ไม่มีค่า
   */
  it('key ตรงแต่ value เป็น null → ต้องไม่นับว่าได้ค่าจริง', () => {
    const withNull = {
      temperature: { value: null, timestamp: 1785818759292 },
      humidity: { value: '71', timestamp: 1785818759292 },
    };
    const r = resolveClimate(withNull);

    expect(r.values.temp).toBeUndefined();
    expect(r.values.rh).toBe(71);
    // จับคู่ชื่อได้แต่ไม่มีค่า — ต้องไม่อยู่ใน matched เพราะ matched ใช้ตัดสินว่าค่าไหนสด
    expect(r.matched.temp).toBeUndefined();
  });

  it('ชื่อ key ที่สะกดผิดต้องไม่ถูกจับคู่ (ไม่ fuzzy match)', () => {
    const r = resolveClimate(NULL_VALUES.data);
    expect(r.values).toEqual({});
    expect([...unmatchedKeys(NULL_VALUES.data)].sort()).toEqual(['soil_moistur', 'temperatur']);
  });
});

describe('history จาก server จริง', () => {
  /**
   * ⚠️ server ส่ง **ใหม่ไปเก่า** — เอาไปวาดกราฟตรงๆ จะได้เส้นกลับด้าน
   * ล็อกไว้ตรงนี้เพื่อให้คนที่มาต่อกราฟย้อนหลังเห็นก่อนเขียนโค้ด
   */
  it('เรียงจากใหม่ไปเก่า — ต้อง sort ก่อนวาดกราฟ', () => {
    const ts = HISTORY.map((p) => p.ts);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    expect(ts).not.toEqual([...ts].sort((a, b) => a - b));
  });

  it('ใช้ `ts` ไม่ใช่ `timestamp` และ value เป็น string', () => {
    const first = HISTORY[0];
    expect(first).toBeDefined();
    expect(first && 'ts' in first).toBe(true);
    expect(first && 'timestamp' in first).toBe(false);
    expect(telemetryNumber(first?.value)).toBe(78.52);
  });
});
