import { describe, expect, it } from 'vitest';
import type { HsCommand, HsDays } from '@shared/handysense';
import { validateHsCommand } from './handysenseValidate';

/** ทุกวันเป็น true — ใช้เป็นฐานแล้วค่อยแก้ทีละเคส */
const ALL_DAYS: HsDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

describe('validateHsCommand — setSwitch', () => {
  it('เปิดสวิตช์ channel 0 ถูกต้อง → ผ่าน', () => {
    expect(validateHsCommand({ action: 'setSwitch', channel: 0, on: true })).toBeNull();
  });

  it('channel 3 (test) ห้ามใช้กับ setSwitch → reject', () => {
    expect(validateHsCommand({ action: 'setSwitch', channel: 3, on: true })).toBe(
      'testChannelSwitch',
    );
  });

  it('on เป็น string ไม่ใช่ boolean แท้ → reject', () => {
    // จำลอง bug ที่ส่ง "true" มา (TS กันได้ แต่ค่าจาก runtime อาจหลุด)
    const bad = { action: 'setSwitch', channel: 0, on: 'true' } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('onType');
  });

  it('channel นอกช่วง 0-3 → reject', () => {
    const bad = { action: 'setSwitch', channel: 5, on: true } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('channel');
  });
});

describe('validateHsCommand — setThreshold', () => {
  it('auto พร้อม temp+soil ครบและถูกช่วง → ผ่าน', () => {
    expect(
      validateHsCommand({
        action: 'setThreshold',
        channel: 1,
        mode: 'auto',
        temp: { enabled: true, min: 30, max: 35 },
        soil: { enabled: false },
      }),
    ).toBeNull();
  });

  it('🔴 auto แต่ลืมส่ง soil → reject (กฎตั้งใจให้เป็นแบบนี้)', () => {
    const bad = {
      action: 'setThreshold',
      channel: 1,
      mode: 'auto',
      temp: { enabled: true, min: 30, max: 35 },
    } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('autoNeedsBoth');
  });

  it('no-auto แต่ยังส่ง temp/soil มา → reject', () => {
    const bad = {
      action: 'setThreshold',
      channel: 1,
      mode: 'no-auto',
      temp: { enabled: false },
    } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('noAutoExtra');
  });

  it('no-auto ไม่ส่ง temp/soil → ผ่าน', () => {
    expect(validateHsCommand({ action: 'setThreshold', channel: 1, mode: 'no-auto' })).toBeNull();
  });

  it('enabled=true แต่ขาด min/max → reject', () => {
    const bad = {
      action: 'setThreshold',
      channel: 0,
      mode: 'auto',
      temp: { enabled: true },
      soil: { enabled: false },
    } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('enabledNeedsRange');
  });

  it('min ≥ max → reject', () => {
    expect(
      validateHsCommand({
        action: 'setThreshold',
        channel: 0,
        mode: 'auto',
        temp: { enabled: true, min: 35, max: 35 },
        soil: { enabled: false },
      }),
    ).toBe('minMax');
  });

  it('temp เกินช่วง 0-60 → reject', () => {
    expect(
      validateHsCommand({
        action: 'setThreshold',
        channel: 0,
        mode: 'auto',
        temp: { enabled: true, min: 30, max: 70 },
        soil: { enabled: false },
      }),
    ).toBe('tempRange');
  });

  it('soil เกินช่วง 0-100 → reject', () => {
    expect(
      validateHsCommand({
        action: 'setThreshold',
        channel: 0,
        mode: 'auto',
        temp: { enabled: false },
        soil: { enabled: true, min: 20, max: 120 },
      }),
    ).toBe('soilRange');
  });
});

describe('validateHsCommand — setSchedule', () => {
  it('โหมด A (แก้วัน/เวลา) ครบถูกต้อง → ผ่าน', () => {
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 3,
        slot: 0,
        enable: true,
        days: { ...ALL_DAYS, sat: false, sun: false },
        startTime: '06:00:00',
        endTime: '06:30:00',
      }),
    ).toBeNull();
  });

  it('โหมด B (pause/resume) ส่งแค่ enable → ผ่าน', () => {
    expect(
      validateHsCommand({ action: 'setSchedule', channel: 3, slot: 0, enable: false }),
    ).toBeNull();
  });

  it('🔴 toggle (ไม่มี days) แต่ดันแนบ startTime มา → reject', () => {
    const bad = {
      action: 'setSchedule',
      channel: 3,
      slot: 0,
      enable: false,
      startTime: '06:00:00',
    } as unknown as HsCommand;
    expect(validateHsCommand(bad)).toBe('pauseHasDays');
  });

  it('slot เกิน 2 → reject (กันสร้างข้อมูลค้างลบไม่ได้)', () => {
    expect(validateHsCommand({ action: 'setSchedule', channel: 3, slot: 3, enable: false })).toBe(
      'slot',
    );
  });

  it('days ไม่ติ๊กเลยสักวัน → reject', () => {
    const noDays: HsDays = {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    };
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 3,
        slot: 0,
        enable: true,
        days: noDays,
        startTime: '06:00:00',
        endTime: '06:30:00',
      }),
    ).toBe('days');
  });

  it('ลบตารางโดยตั้งใจ: ไม่ติ๊กวัน + enable:false + ไม่มีเวลา → ผ่าน (คำสั่งลบ guide §6.3)', () => {
    const noDays: HsDays = {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    };
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 0,
        slot: 1,
        enable: false,
        days: noDays,
      }),
    ).toBeNull();
  });

  it('ไม่ติ๊กวัน + enable:false แต่ยังแนบเวลา → reject (ไม่ใช่รูปแบบคำสั่งลบ)', () => {
    const noDays: HsDays = {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    };
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 0,
        slot: 1,
        enable: false,
        days: noDays,
        startTime: '06:00:00',
        endTime: '06:30:00',
      }),
    ).toBe('days');
  });

  it('startTime = endTime → reject', () => {
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 3,
        slot: 0,
        enable: true,
        days: ALL_DAYS,
        startTime: '06:00:00',
        endTime: '06:00:00',
      }),
    ).toBe('timeEqual');
  });

  it('startTime > endTime (ข้ามเที่ยงคืน) → reject', () => {
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 3,
        slot: 0,
        enable: true,
        days: ALL_DAYS,
        startTime: '23:00:00',
        endTime: '01:00:00',
      }),
    ).toBe('timeOrder');
  });

  it('รูปแบบเวลาไม่ใช่ HH:mm:ss → reject', () => {
    expect(
      validateHsCommand({
        action: 'setSchedule',
        channel: 3,
        slot: 0,
        enable: true,
        days: ALL_DAYS,
        startTime: '6:00',
        endTime: '06:30:00',
      }),
    ).toBe('timeFormat');
  });
});
