import { describe, expect, it } from 'vitest';
import type { Device } from '@shared/device';
import { TH } from '@/i18n/th';
import { guard } from './guards';

const dev = (over: Partial<Device> & Pick<Device, 'id'>): Device => ({
  type: 'bigFan',
  n: 1,
  on: false,
  pending: null,
  online: true,
  auto: true,
  ...over,
});

const devices = (over: Partial<Record<Device['id'], Partial<Device>>> = {}): Device[] => [
  dev({ id: 'big1', type: 'bigFan', n: 1, on: true, ...over.big1 }),
  dev({ id: 'big2', type: 'bigFan', n: 2, on: false, ...over.big2 }),
  dev({ id: 'sml1', type: 'smallFan', n: 1, on: true, ...over.sml1 }),
  dev({ id: 'pump', type: 'pump', n: 0, on: true, ...over.pump }),
];

describe('guard rules', () => {
  it('ถอด G1 แล้ว · เปิดปั๊มได้แม้ถังน้ำต่ำ (ไม่มี guard เรื่องถัง)', () => {
    // ถังเป็นค่า mock กันไม่ได้จริง → ใช้ยืนยันเช็คน้ำ + auto-cutoff แทน (ดู useDeviceCommand)
    expect(guard('pump', true, { devices: devices(), tank: 5, temp: 28, t: TH })).toBeNull();
    expect(guard('pump', true, { devices: devices(), tank: 0, temp: 28, t: TH })).toBeNull();
  });

  it('การ "ปิด" ปั๊มไม่เคยถูกบล็อก', () => {
    expect(guard('pump', false, { devices: devices(), tank: 5, temp: 28, t: TH })).toBeNull();
  });

  it('G2 · ร้อนเกิน 33°C ปิดพัดลมใบใหญ่ตัวสุดท้ายไม่ได้', () => {
    const blocked = guard('big1', false, { devices: devices(), tank: 62, temp: 34.2, t: TH });
    expect(blocked).toBe(TH.guardBigFan('34.2'));
  });

  it('G2 · ถ้าอีกตัวยังเปิดอยู่ ปิดตัวนี้ได้', () => {
    const ds = devices({ big2: { on: true } });
    expect(guard('big1', false, { devices: ds, tank: 62, temp: 34.2, t: TH })).toBeNull();
  });

  it('G2 · นับ pending ของอีกตัวด้วย กันปิดรัวสองตัวก่อนคำสั่งแรกจะ settle', () => {
    // big2 ปิดอยู่แต่กำลังจะเปิด → ถือว่าจะมีตัวเปิด จึงยอมให้ปิด big1
    const ds = devices({ big2: { on: false, pending: 'on' } });
    expect(guard('big1', false, { devices: ds, tank: 62, temp: 34.2, t: TH })).toBeNull();

    // big2 เปิดอยู่แต่กำลังจะปิด → จะไม่เหลือตัวไหนเปิด จึงบล็อก
    const ds2 = devices({ big2: { on: true, pending: 'off' } });
    expect(guard('big1', false, { devices: ds2, tank: 62, temp: 34.2, t: TH })).not.toBeNull();
  });

  it('G2 · อากาศไม่ร้อน ปิดได้ทั้งสองตัว', () => {
    expect(guard('big1', false, { devices: devices(), tank: 62, temp: 30, t: TH })).toBeNull();
  });

  it('G2 · การ "เปิด" พัดลมใบใหญ่ไม่เคยถูกบล็อก', () => {
    expect(guard('big2', true, { devices: devices(), tank: 62, temp: 40, t: TH })).toBeNull();
  });

  it('พัดลมตัวเล็กไม่มี guard เรื่องอุณหภูมิ', () => {
    expect(guard('sml1', false, { devices: devices(), tank: 62, temp: 40, t: TH })).toBeNull();
  });
});
