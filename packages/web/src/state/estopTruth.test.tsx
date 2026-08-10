import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * หยุดฉุกเฉินแล้วอุปกรณ์ยังรายงานว่าทำงานอยู่ — **ห้ามซ่อน**
 *
 * ของเดิม provider ข้าม reconcile ตอน estop → จอค้างที่ "ปิดหมด" ตลอดไปทั้งที่พัดลมยังหมุนจริง
 * ผู้ใช้กดหยุดฉุกเฉิน เห็นจอบอกว่าปลอดภัย แล้วเดินเข้าโรงเรือน = สถานการณ์ที่แย่ที่สุดที่แอปนี้ทำให้เกิดได้
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
import { LED_CONFIRM_TIMEOUT_MS } from '@/lib/deviceTiming';
import { postHsCommand } from '@/services/handysenseControl';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import { useEstop } from '@/hooks/useEstop';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

const mkAttrs = (rec: Record<string, string>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { value: v, timestamp: 1 }]));

function wrapper(attrs: Record<string, string>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <FarmStateProvider forceRealControl forceAttributes={mkAttrs(attrs)}>
      {children}
    </FarmStateProvider>
  );
  Wrapper.displayName = 'EstopTruthWrapper';
  return Wrapper;
}

function useHarness() {
  const confirm = useConfirm();
  const { flash } = useToast();
  const estop = useEstop({ t: TH, confirm, flash });
  return { farm: useFarmState(), estop };
}

/** จำนวนคำสั่ง setSwitch off ของช่องหนึ่ง — ใช้ยืนยันว่า "ยิงซ้ำได้ครั้งเดียว" */
const offCount = (ch: number) =>
  vi
    .mocked(postHsCommand)
    .mock.calls.filter(
      ([, cmd]) => cmd.action === 'setSwitch' && cmd.channel === ch && cmd.on === false,
    ).length;

describe('หยุดฉุกเฉิน — จอต้องบอกความจริง', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('อุปกรณ์ยังรายงาน led=true หลังพ้นช่วงผ่อนผัน → ขึ้นในรายการ "ยังไม่หยุด" + ยิงซ้ำครั้งเดียว', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: wrapper({ led0: 'true' }) });

    await act(async () => {
      result.current.estop.estopPress();
      await vi.advanceTimersByTimeAsync(0); // ปล่อย chain no-auto → setSwitch เดินจนจบ
    });
    expect(result.current.farm.estop).toBe(true);
    expect(offCount(0)).toBe(1); // คำสั่งปิดครั้งแรก
    // ยังอยู่ในช่วงผ่อนผัน — ห้ามเตือนทั้งที่อุปกรณ์ยังไม่ทันตอบ (คำเตือนที่ขึ้นทุกครั้ง = ไม่มีใครอ่าน)
    expect(result.current.farm.estopDefied).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS);
    });

    expect(result.current.farm.estopDefied).toContain('big1');
    expect(offCount(0)).toBe(2); // + ยิงซ้ำอีกครั้งเดียว

    // เดินเวลาต่อไปอีกนาน — ต้อง **ไม่** ยิงซ้ำเรื่อยๆ (จะกลบอาการเสียจริง)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS * 5);
    });
    expect(offCount(0)).toBe(2);
  });

  it('อุปกรณ์หยุดจริง (led=false) → ไม่มีคำเตือน', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: wrapper({ led0: 'false' }) });

    await act(async () => {
      result.current.estop.estopPress();
      await vi.advanceTimersByTimeAsync(0);
    });
    // แยก act — ตัวจับเวลาช่วงผ่อนผันถูกตั้งใน effect ซึ่ง commit หลัง act แรกจบเท่านั้น
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS);
    });

    expect(result.current.farm.estopDefied).toHaveLength(0);
  });

  it('ปลดล็อกแล้วเคาน์เตอร์ยิงซ้ำต้องรีเซ็ต (รอบหน้ายิงซ้ำได้อีกครั้ง)', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: wrapper({ led0: 'true' }) });

    await act(async () => {
      result.current.estop.estopPress();
      await vi.advanceTimersByTimeAsync(0);
    });
    // แยก act — ตัวจับเวลาช่วงผ่อนผันถูกตั้งใน effect ซึ่ง commit หลัง act แรกจบเท่านั้น
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS);
    });
    expect(offCount(0)).toBe(2);

    act(() => result.current.farm.setEstop(false)); // ปลดล็อก
    expect(result.current.farm.estopDefied).toHaveLength(0); // เลิก estop = เลิกเตือน

    await act(async () => {
      result.current.estop.estopPress(); // กดหยุดอีกรอบ
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LED_CONFIRM_TIMEOUT_MS);
    });

    // รอบใหม่ต้องเตือนใหม่และยิงซ้ำได้อีก — ถ้าลืมล้าง `estopRetryRef` ตอนปลดล็อก จะค้างที่ 2
    expect(result.current.farm.estopDefied).toContain('big1');
    expect(offCount(0)).toBeGreaterThan(2);
  });
});
