import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * ปั๊มคูลลิ่งแพดต้องเดินตามพัดลมใหญ่ — **ไม่ใช่ระบบรดน้ำ**
 *
 * ปั๊มป้อนน้ำเข้าแผงคูลลิ่งแพด พัดลมใหญ่ดูดอากาศผ่านแผงเปียกแล้วอุณหภูมิลด
 * (evaporative cooling · เจ้าของงานยืนยัน 2026-08-11 · ดู DESIGN_SOURCE ข้อ 37)
 *
 * กฎที่เทสนี้คุม:
 *   แผงต้องเปียกทุกครั้งที่มีลมผ่าน  → พัดลมใหญ่ตัวใดตัวหนึ่งเดิน = ปั๊มเดิน
 *   ห้ามปล่อยปั๊มเดินตอนไม่มีลม     → พัดลมหยุดหมด = ปั๊มต้องหยุด (ไม่งั้นเปลืองน้ำเปล่า)
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
import { PUMP_CUTOFF_MS } from '@/lib/deviceTiming';
import { postHsCommand } from '@/services/handysenseControl';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useEstop } from '@/hooks/useEstop';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

const mkAttrs = (rec: Record<string, string>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { value: v, timestamp: 1 }]));

/** โหมดจริง + `led` ของพัดลมมาถึงแล้ว (ตัวตามรอสัญญาณนี้ก่อนถึงจะกล้าสั่ง) */
function wrapper(attrs: Record<string, string>) {
  const W = ({ children }: { children: ReactNode }) => (
    <FarmStateProvider forceRealControl forceAttributes={mkAttrs(attrs)}>
      {children}
    </FarmStateProvider>
  );
  W.displayName = 'PadPumpWrapper';
  return W;
}

function useHarness() {
  const confirm = useConfirm();
  const { flash } = useToast();
  const command = useDeviceCommand({ t: TH, temp: 28, confirm, flash });
  const estop = useEstop({ t: TH, confirm, flash });
  return { farm: useFarmState(), command, confirm, estop };
}

/** คำสั่ง setSwitch ที่ยิงไปช่องปั๊ม (ch2) เรียงตามเวลา */
const pumpSwitches = (): boolean[] =>
  vi
    .mocked(postHsCommand)
    .mock.calls.filter(([, cmd]) => cmd.action === 'setSwitch' && cmd.channel === 2)
    .map(([, cmd]) => (cmd as { on: boolean }).on);

const lastPump = (): boolean | undefined => pumpSwitches().at(-1);

describe('ปั๊มคูลลิ่งแพด — เดินตามพัดลมใหญ่', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('พัดลมทั้งคู่ดับ + ปั๊มดับ → ไม่ต้องสั่งอะไรเลย (ไม่ยิงคำสั่งตอนเปิดหน้า)', async () => {
    renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'false', led1: 'false', led2: 'false' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pumpSwitches(), 'สถานะตรงกันอยู่แล้ว ห้ามยิงคำสั่งซ้ำ').toHaveLength(0);
  });

  it('พัดลมใหญ่ #1 เดินอยู่แต่ปั๊มยังดับ → สั่งเปิดปั๊ม (ch2)', async () => {
    renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'true', led1: 'false', led2: 'false' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastPump()).toBe(true);
  });

  it('พัดลมดับหมดแต่ปั๊มยังเดิน → สั่งปิดปั๊ม (กันน้ำไหลทิ้งตอนไม่มีลม)', async () => {
    renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'false', led1: 'false', led2: 'true' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastPump()).toBe(false);
  });

  it('พัดลมใหญ่ #2 ตัวเดียวเดิน → ปั๊มก็ต้องเดิน (แผงเดียวกัน)', async () => {
    renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'false', led1: 'true', led2: 'false' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastPump()).toBe(true);
  });

  it('พัดลมเดินอยู่แล้วปั๊มเดินตาม — ไม่ยิงซ้ำทุก render', async () => {
    const { rerender } = renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'true', led1: 'false', led2: 'true' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = pumpSwitches().length;
    rerender();
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pumpSwitches().length, 'ยิงเฉพาะตอนค่าเปลี่ยน ไม่ใช่ทุก render').toBe(first);
  });

  /**
   * 🔴 เคสที่พังระบบถ้าลืม — ปั๊มที่เดินตามพัดลม **ห้าม**ถูก auto-cutoff ตัดที่ 20 นาที
   * พัดลมอาจต้องเดินยาวหลายชั่วโมงกลางบ่าย ถ้าตัดปั๊ม แผงจะแห้งแล้วหมดผลการลดอุณหภูมิ
   */
  it('ปั๊มที่เดินตามพัดลม ต้องไม่ถูกตัดที่ 20 นาที', async () => {
    const { result } = renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'true', led1: 'false', led2: 'true' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.farm.pumpCutoffAt, 'ไม่นับถอยหลังเลยตอนตามพัดลม').toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUMP_CUTOFF_MS + 60_000);
    });
    expect(result.current.farm.pumpCutoffCount, 'ห้ามมีการตัดเกิดขึ้น').toBe(0);
    expect(
      pumpSwitches().filter((on) => !on),
      'ห้ามมีคำสั่งปิดปั๊มหลุดออกไป',
    ).toHaveLength(0);
  });

  it('หยุดฉุกเฉิน → ตัวตามต้องไม่ปลุกปั๊มกลับ', async () => {
    const { result } = renderHook(() => useHarness(), {
      wrapper: wrapper({ led0: 'true', led1: 'false', led2: 'true' }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.mocked(postHsCommand).mockClear();

    await act(async () => {
      result.current.estop.estopPress();
      await vi.advanceTimersByTimeAsync(0);
    });

    // estop ยิง setSwitch off ให้ทุกช่องอยู่แล้ว — ที่ห้ามมีคือคำสั่ง "เปิด" ปั๊มหลังจากนั้น
    expect(
      pumpSwitches().filter((on) => on),
      'ห้ามสั่งเปิดปั๊มระหว่าง estop',
    ).toHaveLength(0);
  });
});
