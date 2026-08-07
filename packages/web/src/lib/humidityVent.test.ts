import { describe, expect, it } from 'vitest';
import {
  HUM_MAX_RUN_MS,
  HUM_MIN_OFF_MS,
  HUM_MIN_RUN_MS,
  HUM_REST_MS,
  HUM_STAGE_DELAY_MS,
} from './deviceTiming';
import { INITIAL_VENT_STATE, inTimeWindow, nextVent } from './humidityVent';
import type { VentInput, VentState } from './humidityVent';

const NOW = 100_000_000;
const input = (over: Partial<VentInput> = {}): VentInput => ({
  enabled: true,
  live: true,
  estop: false,
  rh: 90,
  onAt: 85,
  offAt: 75,
  inWindow: true,
  now: NOW,
  ...over,
});
const state = (over: Partial<VentState> = {}): VentState => ({ ...INITIAL_VENT_STATE, ...over });

describe('nextVent — ปิดทันทีเมื่อไม่พร้อม', () => {
  it.each([
    ['ปิดระบบ', { enabled: false }],
    ['ไม่ใช่โหมดจริง', { live: false }],
    ['estop', { estop: true }],
    ['ไม่มีค่าความชื้นจริง', { rh: null }],
    ['นอกช่วงเวลา', { inWindow: false }],
  ])('%s → stage 0 แม้กำลังดูดอยู่', (_label, over) => {
    const r = nextVent(state({ stage: 2, ventStartedAt: NOW - 1000 }), input(over));
    expect(r.stage).toBe(0);
  });
});

describe('nextVent — hysteresis (กันเปิด-ปิดถี่)', () => {
  it('ปิดอยู่ + RH > onAt → เปิดพัดลม #1 (stage 1)', () => {
    const r = nextVent(state(), input({ rh: 90 }));
    expect(r.stage).toBe(1);
  });

  it('ปิดอยู่ + RH อยู่ในช่วง offAt–onAt → ยังไม่เปิด', () => {
    const r = nextVent(state(), input({ rh: 80 }));
    expect(r.stage).toBe(0);
  });

  it('เปิดอยู่ (1) + RH อยู่ในช่วง offAt–onAt → คงเปิด (ไม่ปิดจนกว่าจะต่ำกว่า offAt)', () => {
    const r = nextVent(
      state({ stage: 1, changedAt: NOW - HUM_MIN_RUN_MS, ventStartedAt: NOW - HUM_MIN_RUN_MS }),
      input({ rh: 80 }),
    );
    expect(r.stage).toBe(1);
  });

  it('เปิดอยู่ (1) + RH < offAt + เดินครบเวลาขั้นต่ำ → ปิด', () => {
    const r = nextVent(
      state({ stage: 1, changedAt: NOW - HUM_MIN_RUN_MS, ventStartedAt: NOW - HUM_MIN_RUN_MS }),
      input({ rh: 70 }),
    );
    expect(r.stage).toBe(0);
  });
});

describe('nextVent — เวลาขั้นต่ำ (กันกระพริบ)', () => {
  it('เพิ่งเปิด (ยังไม่ครบ MIN_RUN) + RH < offAt → ยังไม่ปิด', () => {
    const r = nextVent(
      state({ stage: 1, changedAt: NOW - (HUM_MIN_RUN_MS - 1000), ventStartedAt: NOW - 1000 }),
      input({ rh: 70 }),
    );
    expect(r.stage).toBe(1);
  });

  it('เพิ่งปิด (ยังไม่ครบ MIN_OFF) + RH สูง → ยังไม่เปิด', () => {
    const r = nextVent(
      state({ stage: 0, changedAt: NOW - (HUM_MIN_OFF_MS - 1000) }),
      input({ rh: 95 }),
    );
    expect(r.stage).toBe(0);
  });
});

describe('nextVent — ทยอยเปิด (staging)', () => {
  it('พัดลม #1 เดินเกิน STAGE_DELAY แต่ RH ยังสูง → เสริม #2 (stage 2)', () => {
    const r = nextVent(
      state({
        stage: 1,
        changedAt: NOW - HUM_STAGE_DELAY_MS,
        ventStartedAt: NOW - HUM_STAGE_DELAY_MS,
      }),
      input({ rh: 90 }),
    );
    expect(r.stage).toBe(2);
  });

  it('พัดลม #1 ยังไม่ถึง STAGE_DELAY → ยังไม่เสริม #2', () => {
    const r = nextVent(
      state({ stage: 1, ventStartedAt: NOW - (HUM_STAGE_DELAY_MS - 1000) }),
      input({ rh: 90 }),
    );
    expect(r.stage).toBe(1);
  });

  it('stage 2 + RH ลงต่ำกว่า onAt + ครบเวลาขั้นต่ำ → ลดเหลือ #1 ตัวเดียว (ประหยัด)', () => {
    const r = nextVent(
      state({ stage: 2, changedAt: NOW - HUM_MIN_RUN_MS, ventStartedAt: NOW - HUM_MIN_RUN_MS }),
      input({ rh: 82 }),
    );
    expect(r.stage).toBe(1);
  });
});

describe('nextVent — ตัดเวลาสูงสุด + พัก', () => {
  it('เปิดต่อเนื่องเกิน MAX_RUN → ปิด + ตั้งช่วงพัก (restUntil)', () => {
    const r = nextVent(
      state({ stage: 2, changedAt: NOW - HUM_MAX_RUN_MS, ventStartedAt: NOW - HUM_MAX_RUN_MS }),
      input({ rh: 95 }),
    );
    expect(r.stage).toBe(0);
    expect(r.state.restUntil).toBe(NOW + HUM_REST_MS);
  });

  it('อยู่ในช่วงพัก (now < restUntil) + RH สูง → ยังไม่เปิด', () => {
    const r = nextVent(state({ stage: 0, restUntil: NOW + 60_000 }), input({ rh: 95 }));
    expect(r.stage).toBe(0);
  });
});

describe('inTimeWindow', () => {
  it('start === end = อนุญาตทั้งวัน', () => {
    expect(inTimeWindow(new Date('2026-08-06T14:00:00+07:00'), '00:00', '00:00')).toBe(true);
  });
  it('อยู่ในช่วง (เวลาไทย)', () => {
    expect(inTimeWindow(new Date('2026-08-06T06:00:00+07:00'), '05:00', '08:00')).toBe(true);
  });
  it('นอกช่วง', () => {
    expect(inTimeWindow(new Date('2026-08-06T09:00:00+07:00'), '05:00', '08:00')).toBe(false);
    expect(inTimeWindow(new Date('2026-08-06T04:00:00+07:00'), '05:00', '08:00')).toBe(false);
  });
  it('start > end (ข้ามเที่ยงคืน) — ในช่วงหลังเริ่ม/ก่อนจบ = เปิด', () => {
    // 23:00 อยู่หลัง 22:00 → เปิด
    expect(inTimeWindow(new Date('2026-08-06T23:00:00+07:00'), '22:00', '02:00')).toBe(true);
    // 01:00 อยู่ก่อน 02:00 (ต้นวันถัดไป) → เปิด
    expect(inTimeWindow(new Date('2026-08-06T01:00:00+07:00'), '22:00', '02:00')).toBe(true);
    // 20:00–06:00 ช่วงดูดกลางคืน: 03:00 → เปิด
    expect(inTimeWindow(new Date('2026-08-06T03:00:00+07:00'), '20:00', '06:00')).toBe(true);
    expect(inTimeWindow(new Date('2026-08-06T21:00:00+07:00'), '20:00', '06:00')).toBe(true);
  });
  it('start > end (ข้ามเที่ยงคืน) — นอกช่วง (กลางวัน) = ปิด', () => {
    // 12:00 อยู่นอกช่วง 22:00–02:00 → ปิด
    expect(inTimeWindow(new Date('2026-08-06T12:00:00+07:00'), '22:00', '02:00')).toBe(false);
    // 10:00 อยู่นอกช่วง 20:00–06:00 → ปิด
    expect(inTimeWindow(new Date('2026-08-06T10:00:00+07:00'), '20:00', '06:00')).toBe(false);
    // ขอบเขต: 02:00 พอดี = จบแล้ว → ปิด
    expect(inTimeWindow(new Date('2026-08-06T02:00:00+07:00'), '22:00', '02:00')).toBe(false);
  });
});
