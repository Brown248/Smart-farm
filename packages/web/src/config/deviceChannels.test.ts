import { describe, expect, it } from 'vitest';
import { CHANNEL_BY_DEVICE, bondedTo, channelOf, isBonded } from './deviceChannels';

describe('deviceChannels — map (ใบเล็กพ่วงใหญ่#2 · ยืนยันหน้างาน 2026-08-07)', () => {
  it('ch0=big1(เดี่ยว) · ch1=big2(+เล็กพ่วง) · ch2=pump', () => {
    expect(CHANNEL_BY_DEVICE).toEqual({ big1: 0, big2: 1, sml1: 1, pump: 2 });
  });

  it('channelOf คืน channel ของแต่ละอุปกรณ์ · ปั๊ม = ch2 (ต่อ relay แล้ว)', () => {
    expect(channelOf('big1')).toBe(0);
    expect(channelOf('big2')).toBe(1);
    expect(channelOf('sml1')).toBe(1); // พ่วงกับ big2 บน ch1 เดียวกัน
    expect(channelOf('pump')).toBe(2);
  });

  it('พัดลมเล็กเป็นตัวพ่วง (bonded) กับพัดลมใหญ่ #2 · ตัวอื่นไม่พ่วง', () => {
    expect(bondedTo('sml1')).toBe('big2');
    expect(isBonded('sml1')).toBe(true);
    expect(bondedTo('big1')).toBeNull();
    expect(bondedTo('big2')).toBeNull();
    expect(bondedTo('pump')).toBeNull();
    expect(isBonded('pump')).toBe(false);
  });
});
