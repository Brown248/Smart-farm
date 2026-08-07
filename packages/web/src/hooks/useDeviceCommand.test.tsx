import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TH } from '@/i18n/th';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { INITIAL_DEVICES } from '@/data/devices';
import {
  DONE_FLASH_MS,
  PUMP_CUTOFF_MS,
  SEND_LATENCY_MS,
  useDeviceCommand,
} from './useDeviceCommand';

/** อุปกรณ์อยู่ใน store กลาง — เทสต้องครอบ provider เหมือนแอปจริง */
const wrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider>{children}</FarmStateProvider>
);

/**
 * เดิม `sml1` ใน seed เป็นออฟไลน์ ใช้ทดสอบการบล็อกคำสั่ง — ตอนนี้ทุกอุปกรณ์ online
 * (เจ้าของงานให้พัดลมเล็กควบคุมได้จริง) จึงฉีดอุปกรณ์ออฟไลน์เข้ามาผ่าน seam ของ provider
 * เพื่อคงคัฟเวอเรจตรรกะ "อุปกรณ์หลุด = สั่งไม่ได้" โดยไม่ผูกกับ seed
 */
const offlineDevices = INITIAL_DEVICES.map((d) => (d.id === 'sml1' ? { ...d, online: false } : d));
const offlineWrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider initialDevices={offlineDevices}>{children}</FarmStateProvider>
);

function useHarness(temp = 28) {
  const confirm = useConfirm();
  const { toast, flash } = useToast();
  const command = useDeviceCommand({ t: TH, temp, confirm, flash });
  return { confirm, toast, command };
}

describe('useDeviceCommand — ห่วงโซ่ความปลอดภัย', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('กดสั่งงาน → ถามยืนยันก่อนเสมอ ไม่ส่งคำสั่งทันที', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.press('big1'));

    expect(result.current.confirm.request).not.toBeNull();
    expect(result.current.confirm.request?.title).toBe(
      TH.confirmDevTitle(TH.actOff, 'พัดลมใบใหญ่ #1'),
    );
    // ยังไม่มีอะไรถูกส่ง
    expect(result.current.command.devices.find((d) => d.id === 'big1')?.pending).toBeNull();
    expect(result.current.command.devices.find((d) => d.id === 'big1')?.on).toBe(true);
  });

  it('ยกเลิกแล้วต้องไม่ส่งคำสั่ง', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.press('big1'));
    act(() => result.current.confirm.cancel());

    expect(result.current.confirm.request).toBeNull();
    expect(result.current.command.devices.find((d) => d.id === 'big1')?.on).toBe(true);
  });

  it('ยืนยัน → pending → settle แล้วค่อยเปลี่ยนสถานะจริงและเขียน log', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    const logBefore = result.current.command.log.length;

    act(() => result.current.command.press('big1'));
    act(() => result.current.confirm.accept());

    // ระหว่างรอ: "สั่งแล้ว" แต่ยัง "ไม่ได้ทำงานจริง"
    const during = result.current.command.devices.find((d) => d.id === 'big1');
    expect(during?.pending).toBe('off');
    expect(during?.on).toBe(true);
    expect(result.current.command.busy).toBe(true);

    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));

    const after = result.current.command.devices.find((d) => d.id === 'big1');
    expect(after?.pending).toBeNull();
    expect(after?.on).toBe(false);
    expect(result.current.command.busy).toBe(false);
    expect(result.current.command.justDone['big1']).toBe(true);
    expect(result.current.command.log.length).toBe(logBefore + 1);
    expect(result.current.command.log[0]?.text).toBe(TH.logManual(TH.actOff, 'พัดลมใบใหญ่ #1'));

    act(() => void vi.advanceTimersByTime(DONE_FLASH_MS));
    expect(result.current.command.justDone['big1']).toBe(false);
  });

  it('กดซ้ำระหว่างรอผล ต้องไม่เปิดกล่องยืนยันอีก', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.press('big1'));
    act(() => result.current.confirm.accept());

    act(() => result.current.command.press('big1'));
    expect(result.current.confirm.request).toBeNull();
  });

  it('อุปกรณ์ออฟไลน์ → บล็อกพร้อมบอกเหตุผล ไม่มีกล่องยืนยัน', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: offlineWrapper });
    act(() => result.current.command.press('sml1'));

    expect(result.current.confirm.request).toBeNull();
    expect(result.current.toast).toBe(TH.offlineBlocked('พัดลมตัวเล็ก #1'));
  });

  it('เปลี่ยนโหมดอุปกรณ์ออฟไลน์ก็ไม่ได้', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: offlineWrapper });
    const before = result.current.command.devices.find((d) => d.id === 'sml1')?.auto;
    act(() => result.current.command.toggleAuto('sml1'));

    expect(result.current.toast).toBe(TH.offlineMode('พัดลมตัวเล็ก #1'));
    expect(result.current.command.devices.find((d) => d.id === 'sml1')?.auto).toBe(before);
  });

  it('ปั๊ม: เปิดแล้วปิดเองอัตโนมัติเมื่อครบ 20 นาที (auto-cutoff แทน G1)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    const pumpOn = () => result.current.command.devices.find((d) => d.id === 'pump')?.on;

    // เปิดปั๊ม → ยืนยัน → settle เป็น on
    act(() => result.current.command.press('pump'));
    act(() => result.current.confirm.accept());
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));
    expect(pumpOn()).toBe(true);

    // เกือบครบ 20 นาที ยังเปิดอยู่
    act(() => void vi.advanceTimersByTime(PUMP_CUTOFF_MS - 1000));
    expect(pumpOn()).toBe(true);

    // ครบเวลา → cutoff สั่งปิด (pending) แล้ว settle เป็น off + เขียน control log
    // (ตัวจับเวลาเป็นของ FarmStateProvider ระดับแอปแล้ว จึงเดินต่อแม้ออกจากหน้าควบคุม)
    act(() => void vi.advanceTimersByTime(1000));
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));
    expect(pumpOn()).toBe(false);
    expect(result.current.command.log[0]?.key).toBe('logPumpCutoff');
  });

  it('ปั๊ม: ปิดปั๊มเองก่อนครบเวลา → cutoff ถูกยกเลิก ไม่ปิดซ้ำ', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    const pump = () => result.current.command.devices.find((d) => d.id === 'pump');

    act(() => result.current.command.press('pump'));
    act(() => result.current.confirm.accept());
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));
    expect(pump()?.on).toBe(true);

    // ปิดเอง
    act(() => result.current.command.press('pump'));
    act(() => result.current.confirm.accept());
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));
    expect(pump()?.on).toBe(false);

    // เดินเวลาเลยจุด cutoff เดิม — ต้องไม่มีคำสั่งปิดซ้ำ/pending ค้าง
    act(() => void vi.advanceTimersByTime(PUMP_CUTOFF_MS));
    expect(pump()?.pending).toBeNull();
    expect(pump()?.on).toBe(false);
  });

  it('guard G2 · ร้อนเกิน → โชว์กล่องคำเตือน (ไม่บล็อกเงียบ) · ยืนยันแล้ว override ได้', () => {
    const { result } = renderHook(() => useHarness(34.5), { wrapper });
    act(() => result.current.command.press('big1'));

    // เดิมบล็อกด้วย toast เฉยๆ — ตอนนี้โชว์กล่องคำเตือน (tone warn) พร้อมเหตุผล ให้เลือกทำต่อ
    expect(result.current.confirm.request?.tone).toBe('warn');
    expect(result.current.confirm.request?.body).toBe(TH.guardBigFan('34.5'));

    // ยืนยันทำต่อ = override → big1 เข้าคิวปิด (pending 'off')
    act(() => result.current.confirm.accept());
    expect(result.current.command.devices.find((d) => d.id === 'big1')?.pending).toBe('off');
  });

  it('Emergency Stop ทำงานทันที ไม่มีหน้าต่างยืนยัน', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.estopPress());

    expect(result.current.confirm.request).toBeNull();
    expect(result.current.command.estop).toBe(true);
    expect(result.current.command.devices.every((d) => !d.on && d.pending === null)).toBe(true);
    expect(result.current.toast).toBe(TH.estopToast);
    expect(result.current.command.log[0]?.text).toBe(TH.logEstop);
  });

  it('ระหว่าง estop สั่งอุปกรณ์ไม่ได้', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.estopPress());
    act(() => result.current.command.press('big1'));

    expect(result.current.confirm.request).toBeNull();
    expect(result.current.toast).toBe(TH.estopBlocked);
  });

  it('การปลดล็อกต้องยืนยันก่อน', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.estopPress());
    act(() => result.current.command.estopPress());

    expect(result.current.confirm.request?.title).toBe(TH.unlockTitle);
    expect(result.current.command.estop).toBe(true);

    act(() => result.current.confirm.accept());
    expect(result.current.command.estop).toBe(false);
    expect(result.current.toast).toBe(TH.unlockToast);
    expect(result.current.command.log[0]?.text).toBe(TH.logUnlock);
  });

  it('เปลี่ยนโหมดอุปกรณ์ออนไลน์ได้ และบันทึกลง log', () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.command.toggleAuto('big1'));

    expect(result.current.command.devices.find((d) => d.id === 'big1')?.auto).toBe(false);
    expect(result.current.command.log[0]?.text).toBe(
      TH.logMode('พัดลมใบใหญ่ #1', TH.modeManualFull),
    );
  });
});
