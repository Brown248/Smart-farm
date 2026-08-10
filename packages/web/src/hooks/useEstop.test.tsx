import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * หยุดฉุกเฉินในโหมดจริง — **ต้องปิดเกณฑ์อัตโนมัติในอุปกรณ์ด้วย ไม่ใช่แค่ปิดสวิตช์**
 *
 * ของเดิมยิงแค่ `setSwitch off` → พัดลมที่ตั้ง `mode:'auto'` กลับมาหมุนเองในรอบประเมินถัดไป (~10 วิ)
 * = กดหยุดฉุกเฉินแล้วไม่ได้หยุดจริง ซึ่งเป็นเรื่องความปลอดภัยของคนที่จะเดินเข้าโรงเรือน
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
import { postHsCommand } from '@/services/handysenseControl';
import { HS_TEST_CHANNEL, type HsCommand } from '@shared/handysense';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import { useEstop } from './useEstop';

const liveWrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl>{children}</FarmStateProvider>
);
const mockWrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider>{children}</FarmStateProvider>
);

function useHarness() {
  const confirm = useConfirm();
  const { toast, flash } = useToast();
  const estop = useEstop({ t: TH, confirm, flash });
  return { confirm, toast, estop };
}

/** คำสั่งทั้งหมดที่ถูกยิงออกไป เรียงตามลำดับจริง */
const sent = (): HsCommand[] => vi.mocked(postHsCommand).mock.calls.map((c) => c[1]);

describe('useEstop — โหมดจริง', () => {
  beforeEach(() => {
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('กดหยุดฉุกเฉิน → ปิดเกณฑ์อัตโนมัติ **ก่อน** ปิดสวิตช์ ครบทุกช่องที่มีอุปกรณ์จริง', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });

    await act(async () => {
      result.current.estop.estopPress();
      await Promise.resolve(); // ปล่อยให้ chain no-auto → setSwitch เดินจนจบ
      await Promise.resolve();
    });

    const cmds = sent();
    for (const ch of [0, 1, 2] as const) {
      const noAuto = cmds.findIndex(
        (c) => c.action === 'setThreshold' && c.channel === ch && c.mode === 'no-auto',
      );
      const off = cmds.findIndex(
        (c) => c.action === 'setSwitch' && c.channel === ch && c.on === false,
      );
      expect(noAuto, `ch${ch} ต้องมีคำสั่งปิดเกณฑ์`).toBeGreaterThanOrEqual(0);
      expect(off, `ch${ch} ต้องมีคำสั่งปิดสวิตช์`).toBeGreaterThanOrEqual(0);
      // 🔴 ลำดับสำคัญ — ปิดสวิตช์ก่อนแล้วค่อยปิดเกณฑ์ อุปกรณ์อาจเปิดกลับคั่นกลางสองคำสั่ง
      expect(noAuto, `ch${ch} ต้องปิดเกณฑ์ก่อนปิดสวิตช์`).toBeLessThan(off);
    }
  });

  it('ไม่แตะ channel ทดสอบ (ไม่มีอุปกรณ์จริงต่ออยู่)', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    await act(async () => {
      result.current.estop.estopPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sent().some((c) => c.channel === HS_TEST_CHANNEL)).toBe(false);
  });

  it('ปลดล็อก → บอกว่าโหมดอัตโนมัติยังปิดอยู่ (ผู้ใช้ต้องเปิดเอง)', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: liveWrapper });
    await act(async () => {
      result.current.estop.estopPress();
      await Promise.resolve();
    });
    act(() => result.current.estop.estopPress()); // กดอีกครั้ง = ขอปลดล็อก
    act(() => result.current.confirm.accept());

    expect(result.current.estop.estop).toBe(false);
    expect(result.current.toast).toBe(TH.estopAutoDisabled);
  });

  it('โหมดจำลอง (ไม่ล็อกอิน): ไม่ยิงคำสั่งจริงเลย และข้อความปลดล็อกเหมือนเดิม', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: mockWrapper });

    act(() => result.current.estop.estopPress());
    expect(postHsCommand).not.toHaveBeenCalled();

    act(() => result.current.estop.estopPress());
    act(() => result.current.confirm.accept());
    expect(result.current.toast).toBe(TH.unlockToast);
  });
});
