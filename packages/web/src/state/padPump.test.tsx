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
import { PUMP_CUTOFF_MS, SEND_LATENCY_MS } from '@/lib/deviceTiming';
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

  /**
   * 🔴 อาการที่เจ้าของงานจับได้จากหน้าจอจริง (2026-08-11)
   *
   * เปิดหน้าตอนยังไม่ล็อกอิน = โหมดจำลอง (พัดลม #1 เปิด + ปั๊มเปิด → สถานะตรงกัน ไม่ต้องสั่ง)
   * พอ socket ต่อติดกลายเป็นโหมดจริง อุปกรณ์รายงาน `led2=false` (ปั๊มปิดจริง)
   * แต่ `bigFanOn` ยังเป็น true เท่าเดิม → ความจำ "สั่งไปแล้ว" ตัดจบ **ปั๊มไม่มีวันถูกสั่งเปิด**
   */
  it('สลับจากโหมดจำลองเป็นโหมดจริงแล้วพบว่าปั๊มปิดอยู่ → ต้องสั่งเปิดตามพัดลม', async () => {
    /*
     * ต้องเป็น provider **ตัวเดิม** ที่เปลี่ยนโหมด ไม่ใช่สร้างใหม่
     * ถ้าสร้างใหม่ ref ทุกตัวจะรีเซ็ต แล้วเทสจะผ่านทั้งที่บั๊กยังอยู่ (เป็นบั๊กของ "ความจำข้ามโหมด")
     * `FarmStateProvider` เป็น component type เดิมที่ตำแหน่งเดิม React จึงคง instance ไว้
     */
    const mode = { real: false, attrs: {} as Record<string, string> };
    const Switching = ({ children }: { children: ReactNode }) =>
      mode.real ? (
        <FarmStateProvider forceRealControl forceAttributes={mkAttrs(mode.attrs)}>
          {children}
        </FarmStateProvider>
      ) : (
        <FarmStateProvider>{children}</FarmStateProvider>
      );
    Switching.displayName = 'SwitchingWrapper';

    // รอบแรก: โหมดจำลอง — พัดลม #1 เปิด + ปั๊มเปิด (ค่าเริ่มต้นสอดคล้องกัน) จึงไม่ต้องสั่งอะไร
    const { rerender } = renderHook(() => useHarness(), { wrapper: Switching });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pumpSwitches(), 'โหมดจำลองยังไม่ต้องยิงคำสั่งจริง').toHaveLength(0);

    // รอบสอง: ล็อกอินแล้ว → โหมดจริง · อุปกรณ์บอกว่าพัดลม #1 เดิน แต่ปั๊มปิด
    mode.real = true;
    mode.attrs = { led0: 'true', led1: 'false', led2: 'false' };
    await act(async () => {
      rerender();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastPump(), 'ต้องสั่งเปิดปั๊มให้ตรงกับพัดลมที่เดินอยู่').toBe(true);
  });

  /**
   * 2 โหมดที่เจ้าของงานสั่ง: กดคุมเอง กับ กดกลับเป็นอัตโนมัติ
   *
   * เดิมมีทางเดียว — กดสวิตช์แล้วกลายเป็นคุมมือ แล้ว**ต้องรอจนสถานะพัดลมเปลี่ยนเอง**
   * ถึงจะกลับเป็นอัตโนมัติ ผู้ใช้กดคืนเองไม่ได้เลย
   *
   * เทสนี้ใช้ **โหมดจำลอง** เพราะโหมดจริงอ่านสถานะปั๊มจาก `led2` ที่ harness ตรึงค่าไว้
   * (กดปิดปั๊มแล้ว `led2` ไม่ขยับ ตัวตามจึงยังเห็นว่าปั๊มเดินอยู่ = ไม่มีอะไรให้สั่ง)
   */
  it('กดคุมเอง → ตัวตามหยุดคุม · กดอัตโนมัติ → กลับไปตามพัดลมทันทีโดยไม่ต้องรอพัดลมเปลี่ยน', async () => {
    const Mock = ({ children }: { children: ReactNode }) => (
      <FarmStateProvider>{children}</FarmStateProvider>
    );
    Mock.displayName = 'MockWrapper';
    // ค่าเริ่มต้นโหมดจำลอง: พัดลมใหญ่ #1 เดิน + ปั๊มเดินตาม = สถานะตรงกัน
    const { result } = renderHook(() => useHarness(), { wrapper: Mock });
    const pumpOn = () => result.current.farm.devices.find((d) => d.id === 'pump')?.on;
    expect(pumpOn()).toBe(true);

    // 1) เปลี่ยนเป็นคุมด้วยมือ
    await act(async () => {
      result.current.farm.setPumpMode('manual');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.farm.pumpManual).toBe(true);

    // 2) สั่งปิดปั๊มเองระหว่างพัดลมยังเดิน (เช่นถอดแผงมาล้าง) — ตัวตามต้องไม่แย่งเปิดกลับ
    await act(async () => {
      result.current.command.press('pump');
    });
    await act(async () => {
      result.current.confirm.accept();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEND_LATENCY_MS);
    });
    expect(pumpOn(), 'อยู่โหมดคุมมือ ตัวตามห้ามเปิดปั๊มกลับ').toBe(false);
    expect(result.current.farm.pumpManual, 'กดสวิตช์เองแล้วต้องยังเป็นคุมมือ').toBe(true);

    // 3) กด "อัตโนมัติ" — ต้องเปิดคืนทันที ทั้งที่สถานะพัดลมไม่ได้เปลี่ยนเลย
    await act(async () => {
      result.current.farm.setPumpMode('auto');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.farm.pumpManual).toBe(false);
    expect(pumpOn(), 'พัดลมยังเดินอยู่ → ปั๊มต้องกลับมาเดินตาม').toBe(true);
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
