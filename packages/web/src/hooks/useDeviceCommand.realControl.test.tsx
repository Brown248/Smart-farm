import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TH } from '@/i18n/th';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { reportDeviceFreshness, resetLiveStatusForTest } from '@/state/liveStatus';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import { useDeviceCommand } from './useDeviceCommand';

/**
 * โหมดควบคุมจริง (HandySense) — บังคับเปิดผ่าน seam `forceRealControl`
 * โดยไม่ต้องต่อ backend จริง · ในเทสไม่มี env/token → `readHsContext()` = null
 */
const liveWrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl>{children}</FarmStateProvider>
);

function useHarness(temp = 28) {
  const confirm = useConfirm();
  const { toast, flash } = useToast();
  const command = useDeviceCommand({ t: TH, temp, confirm, flash });
  return { confirm, toast, command };
}

describe('useDeviceCommand — โหมดควบคุมจริง', () => {
  it('กดปั๊มในโหมดจริง → ขึ้นกล่องยืนยันเช็คน้ำ (ปั๊มต่อ ch2 แล้ว ไม่บล็อก)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.press('pump'));
    // ปั๊มต่อ relay จริงแล้ว (ch2) → ไม่บล็อก · ต้องยืนยันเช็คน้ำก่อนเปิด
    expect(result.current.confirm.request).not.toBeNull();
  });

  it('รดน้ำทั้งโรงเรือนในโหมดจริง → ขึ้นกล่องยืนยัน (ปั๊มต่อ ch2 แล้ว ไม่บล็อก)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.waterAll());
    expect(result.current.confirm.request).not.toBeNull();
  });

  it('กดพัดลม (มี channel) → ยืนยันได้ แต่ยังส่งจริงไม่ได้ (ไม่มี token/env) → แจ้ง hsSendError', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    // big2 เริ่มปิด → กด = เปิด (ไม่ติด guard G2 ที่บล็อกเฉพาะตอน "ปิด")
    act(() => result.current.command.press('big2'));
    expect(result.current.confirm.request).not.toBeNull();
    act(() => result.current.confirm.accept());
    expect(result.current.toast).toBe(TH.hsSendError);
  });

  // ── setThreshold ──
  it('setThreshold: ค่าไม่ถูกต้อง (min ≥ max) → บอกชัด hsInvalidRange ไม่ส่ง', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendThreshold('big1', { enabled: true, min: 40, max: 30 }));
    expect(result.current.toast).toBe(TH.hsInvalidRange);
  });

  it('setThreshold: ค่าถูกต้องแต่ยังส่งไม่ได้ (ไม่มี token/env) → hsSendError', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendThreshold('big1', { enabled: true, min: 30, max: 35 }));
    expect(result.current.toast).toBe(TH.hsSendError);
  });

  it('setThreshold กับตัวพ่วง (พัดลมเล็ก) → บล็อก · บอกให้ตั้งที่พัดลมใหญ่ #2', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendThreshold('sml1', { enabled: true, min: 30, max: 35 }));
    expect(result.current.toast).toBe(TH.ghBondedFollows(`${TH.bigFan} #2`));
  });

  // ── setSchedule (validation ก่อนส่ง) ──
  const DAYS = (on: boolean) => ({
    mon: on,
    tue: on,
    wed: on,
    thu: on,
    fri: on,
    sat: on,
    sun: on,
  });

  it('setSchedule บันทึก: ไม่เลือกวันเลย → hsScheduleDays (ไม่ส่ง)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() =>
      result.current.command.sendScheduleSave('big1', {
        slot: 0,
        enable: true,
        days: DAYS(false),
        startTime: '06:00',
        endTime: '06:30',
      }),
    );
    expect(result.current.toast).toBe(TH.hsScheduleDays);
  });

  it('setSchedule บันทึก: เริ่ม ≥ จบ → hsScheduleTime (ไม่ส่ง)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() =>
      result.current.command.sendScheduleSave('big1', {
        slot: 0,
        enable: true,
        days: DAYS(true),
        startTime: '07:00',
        endTime: '06:00',
      }),
    );
    expect(result.current.toast).toBe(TH.hsScheduleTime);
  });

  it('setSchedule กับตัวพ่วง (พัดลมเล็ก) → บล็อก · บอกให้ตั้งที่พัดลมใหญ่ #2', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendScheduleToggle('sml1', 0, false));
    expect(result.current.toast).toBe(TH.ghBondedFollows(`${TH.bigFan} #2`));
  });

  // ── อุปกรณ์ถูกระงับ (netpie_banned) → กันทุกคำสั่ง (กดแล้วระบบตอบ ok:true หลอกว่าสำเร็จ) ──
  describe('อุปกรณ์ถูกระงับ (netpie_banned)', () => {
    afterEach(() => resetLiveStatusForTest());

    it('กดสวิตช์ → บล็อก · แจ้ง hsDeviceBanned (ไม่ขึ้นกล่องยืนยัน)', () => {
      const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
      act(() => reportDeviceFreshness(false, Date.now(), true, 0));
      act(() => result.current.command.press('big2'));
      expect(result.current.toast).toBe(TH.hsDeviceBanned);
      expect(result.current.confirm.request).toBeNull();
    });

    it('รดน้ำทั้งโรงเรือน → บล็อก · แจ้ง hsDeviceBanned', () => {
      const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
      act(() => reportDeviceFreshness(false, Date.now(), true, 0));
      act(() => result.current.command.waterAll());
      expect(result.current.toast).toBe(TH.hsDeviceBanned);
      expect(result.current.confirm.request).toBeNull();
    });

    it('setThreshold → บล็อก · แจ้ง hsDeviceBanned', () => {
      const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
      act(() => reportDeviceFreshness(false, Date.now(), true, 0));
      act(() => result.current.command.sendThreshold('big1', { enabled: true, min: 30, max: 35 }));
      expect(result.current.toast).toBe(TH.hsDeviceBanned);
    });

    it('disableTempAuto → บล็อก · แจ้ง hsDeviceBanned', () => {
      const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
      act(() => reportDeviceFreshness(false, Date.now(), true, 0));
      act(() => result.current.command.disableTempAuto('big1'));
      expect(result.current.toast).toBe(TH.hsDeviceBanned);
      expect(result.current.confirm.request).toBeNull();
    });
  });

  // ── ปิดออโต้ต้องสั่งดับรีเลย์ด้วย (setThreshold no-auto → setSwitch off) ──
  describe('disableTempAuto', () => {
    it('ตัวพ่วง (พัดลมเล็ก) → บล็อก · บอกให้ไปตั้งที่ใหญ่ #2', () => {
      const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
      act(() => result.current.command.disableTempAuto('sml1'));
      expect(result.current.toast).toBe(TH.ghBondedFollows(`${TH.bigFan} #2`));
    });

    it('อากาศไม่ร้อน (28°C) → ไม่ติด G2 → ลงมือเลย (ไม่มี token → hsSendError)', () => {
      const { result } = renderHook(() => useHarness(28), { wrapper: liveWrapper });
      act(() => result.current.command.disableTempAuto('big1'));
      // ไม่มี env/token ในเทส → readHsContext null → hsSendError · แต่ต้องไม่มีกล่องยืนยัน (ไม่ติด G2)
      expect(result.current.confirm.request).toBeNull();
      expect(result.current.toast).toBe(TH.hsSendError);
    });

    it('ร้อน >33°C + จะดับพัดลมใหญ่ตัวสุดท้าย → เด้งกล่องเตือน G2 (ไม่ดับทันที)', () => {
      // INITIAL_DEVICES: big1 on, big2 off → ปิด big1 = ปิดตัวใหญ่ตัวสุดท้าย
      const { result } = renderHook(() => useHarness(36), { wrapper: liveWrapper });
      act(() => result.current.command.disableTempAuto('big1'));
      expect(result.current.confirm.request).not.toBeNull();
      expect(result.current.confirm.request?.title).toBe(TH.guardWarnTitle);
      // กดยืนยัน → ลงมือ (ไม่มี token → hsSendError)
      act(() => result.current.confirm.accept());
      expect(result.current.toast).toBe(TH.hsSendError);
    });
  });
});

describe('useDeviceCommand — setThreshold โหมดจำลอง', () => {
  const mockWrapper = ({ children }: { children: ReactNode }) => (
    <FarmStateProvider>{children}</FarmStateProvider>
  );

  it('โหมดจำลอง (ยังไม่ login) → hsNotLive (ไม่ยิงคำสั่งจริง)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: mockWrapper });
    act(() => result.current.command.sendThreshold('big1', { enabled: true, min: 30, max: 35 }));
    expect(result.current.toast).toBe(TH.hsNotLive);
  });
});
