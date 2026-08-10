import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * พิสูจน์ข้อ 1.3 ของ smoke-test: POST สำเร็จแต่ **ไม่มี cmd_result** กลับมา
 * → ครบ 15 วิ ต้องขึ้น "ไม่ทราบผล" (ไม่หมุนค้าง · ไม่บอกว่าสำเร็จ) และปลด pending
 *
 * mock เฉพาะ `readHsContext` (ให้มี ctx) + `postHsCommand` (ให้ POST ผ่าน) — ตัวจับเวลา/tracker ของจริง
 * ในเทสไม่มี telemetry ป้อน cmd_result → tracker จึงครบ timeout เอง = จำลอง "ตัด network หลังส่ง" เป๊ะ
 */
vi.mock('@/services/handysenseControl', async (importOriginal) => {
  const actual = await importOriginal<typeof HsControl>();
  return {
    ...actual,
    readHsContext: () => ({ apiBase: 'https://x/api/v1', deviceId: 'dev', token: 'tok' }),
    postHsCommand: vi.fn().mockResolvedValue(undefined),
  };
});

import { TH } from '@/i18n/th';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { HsPostTimeoutError, postHsCommand } from '@/services/handysenseControl';
import { LED_CONFIRM_TIMEOUT_MS } from '@/lib/deviceTiming';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import { useDeviceCommand } from './useDeviceCommand';

const EVERYDAY = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
} as const;
const lastCmd = () => vi.mocked(postHsCommand).mock.calls.at(-1)?.[1];

const liveWrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl>{children}</FarmStateProvider>
);

function useHarness() {
  const confirm = useConfirm();
  const { toast, flash } = useToast();
  const command = useDeviceCommand({ t: TH, temp: 28, confirm, flash });
  return { confirm, toast, command };
}

const pendingOf = (
  r: { current: { command: { devices: readonly { id: string; pending: unknown }[] } } },
  id: string,
) => r.current.command.devices.find((d) => d.id === id)?.pending ?? null;

describe('useDeviceCommand — timeout ของคำสั่งจริง (smoke-test ข้อ 1.3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('POST ผ่านแต่ไม่มี cmd_result → 15 วิ ขึ้น "ไม่ทราบผล" + ปลด pending (ไม่ค้าง/ไม่บอกสำเร็จ)', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });

    // big2 เริ่มปิด → กด = เปิด (ไม่ติด guard) → ยืนยัน
    act(() => result.current.command.press('big2'));
    await act(async () => {
      result.current.confirm.accept();
      await vi.advanceTimersByTimeAsync(0); // flush POST resolve → tracker.track ตั้งเวลา
    });
    // ระหว่างรอ: pending = "กำลังส่ง/รอผล" · ยังไม่มี toast แจ้งสำเร็จ/พลาด
    expect(pendingOf(result, 'big2')).toBe('on');
    expect(result.current.toast).toBeNull();

    // เดินเวลาไป 15 วิ โดยไม่มี cmd_result → tracker timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(result.current.toast).toBe(TH.hsUnknown);
    expect(pendingOf(result, 'big2')).toBeNull();
  });
});

/**
 * POST เองค้าง (ไม่ใช่ "ส่งแล้วไม่มีผลกลับ") — เคสที่เกิดจริงบนแท็บเล็ตที่ wifi ในโรงเรือนหลุดๆ ติดๆ
 *
 * ของเดิม safety timer ถูกตั้งไว้ **ข้างใน `.then()`** ของ POST → chain ไม่เดิน = timer ไม่เคยถูกตั้ง
 * → `pending` ค้างถาวร ปุ่มกดไม่ได้จนกว่าจะรีโหลดหน้า เทสนี้จะ fail ทันทีถ้ามีคนย้ายมันกลับเข้าไป
 */
describe('useDeviceCommand — POST ค้าง ต้องไม่ทำให้ปุ่มค้างถาวร', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });

  it('POST ไม่ตอบเลย → ครบ LED_CONFIRM_TIMEOUT_MS ต้องปลด pending + บอกว่าไม่ทราบผล', async () => {
    // Promise ที่ไม่ resolve และไม่ reject = คำขอแขวนค้าง (เบราว์เซอร์ไม่มี timeout ให้ fetch)
    vi.mocked(postHsCommand)
      .mockReset()
      .mockReturnValue(new Promise<void>(() => {}));
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });

    act(() => result.current.command.press('big2'));
    await act(async () => {
      result.current.confirm.accept();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pendingOf(result, 'big2')).toBe('on');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS);
    });

    expect(pendingOf(result, 'big2')).toBeNull();
    expect(result.current.toast).toBe(TH.hsUnconfirmed);
  });

  it('POST หมดเวลา (HsPostTimeoutError) → ปลด pending ทันที + บอกว่าเครือข่ายช้า', async () => {
    vi.mocked(postHsCommand).mockReset().mockRejectedValue(new HsPostTimeoutError());
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });

    act(() => result.current.command.press('big2'));
    await act(async () => {
      result.current.confirm.accept();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pendingOf(result, 'big2')).toBeNull();
    // ต้องแยกจาก hsSendError — ผู้ใช้ต้องรู้ว่าเป็นเรื่องเน็ตช้า ไม่ใช่อุปกรณ์พัง
    expect(result.current.toast).toBe(TH.hsSendTimeout);
  });
});

describe('useDeviceCommand — setSchedule payload (กันลบตารางถาวร)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // ตั้ง implementation ใหม่ทุกครั้ง (mockClear เผลอล้าง resolved value) — ต้องคืน Promise
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('🔴 พัก/เปิด (โหมด B): payload มีแค่ enable — **ไม่มี days/time** เด็ดขาด', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendScheduleToggle('big1', 0, false));

    const cmd = lastCmd();
    // big1 = channel 0 · โหมด B ห้ามมี days (ไม่งั้นลบตารางถาวร)
    expect(cmd).toEqual({ action: 'setSchedule', channel: 0, slot: 0, enable: false });
    expect(cmd && 'days' in cmd).toBe(false);
    expect(cmd && 'startTime' in cmd).toBe(false);
  });

  it('🔴 ลบตาราง: payload = enable:false + days ไม่ติ๊กเลย + ไม่มีเวลา (คำสั่งลบ guide §6.3)', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() => result.current.command.sendScheduleDelete('big1', 2));

    const cmd = lastCmd() as {
      action: string;
      channel: number;
      slot: number;
      enable: boolean;
      days: Record<string, boolean>;
      startTime?: string;
    };
    expect(cmd.action).toBe('setSchedule');
    expect(cmd.channel).toBe(0); // big1
    expect(cmd.slot).toBe(2);
    expect(cmd.enable).toBe(false);
    // ต้องมี days ครบ 7 key และไม่ติ๊กเลยสักวัน — นี่คือสัญญาณ "ลบ" ของอุปกรณ์
    expect(Object.keys(EVERYDAY).every((k) => cmd.days[k] === false)).toBe(true);
    // ห้ามแนบเวลา (ไม่งั้น validation ตีเป็น 'days' แล้วไม่ส่ง)
    expect('startTime' in cmd).toBe(false);
  });

  it('บันทึกตาราง (โหมด A): payload มี days + เวลาแปลงเป็น HH:mm:ss', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    act(() =>
      result.current.command.sendScheduleSave('big2', {
        slot: 1,
        enable: true,
        days: { ...EVERYDAY, sat: false, sun: false },
        startTime: '06:00',
        endTime: '06:30',
      }),
    );

    const cmd = lastCmd();
    expect(cmd).toMatchObject({
      action: 'setSchedule',
      channel: 1, // big2
      slot: 1,
      enable: true,
      startTime: '06:00:00',
      endTime: '06:30:00',
    });
    expect((cmd as { days: Record<string, boolean> }).days.sun).toBe(false);
  });
});
