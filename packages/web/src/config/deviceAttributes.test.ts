import { describe, expect, it } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import { readChannelState, readShadowTs, type Attributes } from './deviceAttributes';

/** สร้าง attributes จาก record ของ string (ค่าจริงมาเป็น string ทุกตัว) */
function attrs(rec: Record<string, string>): Attributes {
  const out: Record<string, TelemetryValue> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = { value: v, timestamp: 1000 };
  return out;
}

describe('readChannelState', () => {
  it('led + เกณฑ์อุณหภูมิเปิดอยู่ → on/mode ถูก', () => {
    const s = readChannelState(
      attrs({
        led0: 'true',
        min_temp0: '30',
        max_temp0: '35',
        min_soil0: '0',
        max_soil0: '0',
      }),
      0,
    );
    expect(s.on).toBe(true);
    expect(s.temp).toEqual({ on: true, min: 30, max: 35 });
    expect(s.soil.on).toBe(false);
    // มี temp automation → auto
    expect(s.mode).toBe('auto');
  });

  it('เกณฑ์ (0,0) ทั้งคู่ → no-auto', () => {
    const s = readChannelState(
      attrs({ led1: 'false', min_temp1: '0', max_temp1: '0', min_soil1: '0', max_soil1: '0' }),
      1,
    );
    expect(s.on).toBe(false);
    expect(s.mode).toBe('no-auto');
    expect(s.temp.on).toBe(false);
    expect(s.soil.on).toBe(false);
  });

  it('soil เปิดอยู่ตัวเดียว → ยัง auto', () => {
    const s = readChannelState(
      attrs({ min_temp2: '0', max_temp2: '0', min_soil2: '40', max_soil2: '80' }),
      2,
    );
    expect(s.mode).toBe('auto');
    expect(s.soil).toEqual({ on: true, min: 40, max: 80 });
  });

  it('ไม่มีค่าเลย → on:null · mode no-auto', () => {
    const s = readChannelState(attrs({}), 0);
    expect(s.on).toBeNull();
    expect(s.mode).toBe('no-auto');
    expect(s.temp).toEqual({ on: false, min: null, max: null });
  });

  it('parse timer object + saved values', () => {
    const s = readChannelState(
      attrs({
        led0: '1',
        timer00: JSON.stringify({
          enable: true,
          days: {
            mon: true,
            tue: true,
            wed: true,
            thu: true,
            fri: true,
            sat: true,
            sun: false,
          },
          startTime: '20:00:00',
          endTime: '20:20:00',
          raw: '1,1,1,1,1,1,1,0,20:00:00,20:20:00',
        }),
        saved_min_temp0: '28',
        saved_max_temp0: '33',
      }),
      0,
    );
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0]).toMatchObject({
      slot: 0,
      enable: true,
      startTime: '20:00:00',
      endTime: '20:20:00',
    });
    expect(s.timers[0]?.days?.sun).toBe(false);
    expect(s.savedTemp).toEqual({ min: 28, max: 33 });
  });

  it('timer ที่ JSON พัง → ข้าม ไม่ล้ม', () => {
    const s = readChannelState(attrs({ timer00: '{not json' }), 0);
    expect(s.timers).toHaveLength(0);
  });
});

describe('readShadowTs', () => {
  it('อ่านเวลาอัปเดตล่าสุด', () => {
    expect(readShadowTs(attrs({ shadow_ts: '1785900000000' }))).toBe(1785900000000);
    expect(readShadowTs(attrs({}))).toBeNull();
  });
});
