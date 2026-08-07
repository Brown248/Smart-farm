import { describe, expect, it } from 'vitest';
import type { Device } from '@shared/device';
import { TH } from '@/i18n/th';
import { deviceView } from './deviceView';

const dev: Device = {
  id: 'big1',
  type: 'bigFan',
  n: 1,
  on: true,
  pending: null,
  online: true,
  auto: false,
};

const ctx = { t: TH, estop: false, justDone: false, index: 0 };

describe('deviceView — ปุ่มโหมด auto/manual', () => {
  it('โหมดจำลอง: ปุ่มโหมดกดได้ (ไม่ disable)', () => {
    const v = deviceView(dev, ctx);
    expect(v.modeDisabled).toBe(false);
  });

  it('โหมดจริง: ปุ่มโหมด disable — auto/manual มาจากเกณฑ์ในอุปกรณ์ ไม่ใช่ปุ่มหลอกที่กดแล้วไม่ส่งอะไร (Finding 1)', () => {
    const v = deviceView(dev, { ...ctx, realControl: true });
    expect(v.modeDisabled).toBe(true);
  });

  it('ออฟไลน์: ปุ่มโหมด disable เสมอ ไม่ว่าโหมดไหน', () => {
    expect(deviceView({ ...dev, online: false }, ctx).modeDisabled).toBe(true);
    expect(deviceView({ ...dev, online: false }, { ...ctx, realControl: true }).modeDisabled).toBe(
      true,
    );
  });
});
