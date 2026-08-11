import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * auto-cutoff ปั๊ม — **ใช้เฉพาะปั๊มที่ผู้ใช้กดเปิดเอง**
 *
 * ตัวตัดนี้เกิดมาเพื่อกัน "เปิดค้างลืมปิด" สมัยที่ยังเข้าใจผิดว่าปั๊มคือระบบรดน้ำ
 * ตอนนี้ปั๊มคือปั๊มคูลลิ่งแพดที่เดินตามพัดลมใหญ่ (DESIGN_SOURCE ข้อ 37) — ปั๊มแบบนั้น
 * **ห้ามถูกตัด** เพราะพัดลมอาจต้องเดินยาวหลายชั่วโมง และมันหยุดเองอยู่แล้วเมื่อพัดลมหยุด
 *
 * เหลือเคสเดียวที่ยังต้องมีตัวตัด: ผู้ใช้กดเปิดปั๊มเองเพื่อล้างแผง/ซ่อม แล้วลืมปิด
 * และเมื่อมันตัด **ต้องบอกล่วงหน้า** ไม่ใช่ดับเงียบๆ (เจ้าของงานเคยเจอแล้วหาสาเหตุไม่เจอ)
 */
vi.mock('@/services/handysenseControl', async (importOriginal) => {
  const actual = await importOriginal<typeof HsControl>();
  return {
    ...actual,
    readHsContext: () => ({ apiBase: 'https://x/api/v1', deviceId: 'dev', token: 'tok' }),
    postHsCommand: vi.fn().mockResolvedValue(undefined),
  };
});

import { INITIAL_DEVICES } from '@/data/devices';
import { TH } from '@/i18n/th';
import { PUMP_CUTOFF_MS, SEND_LATENCY_MS } from '@/lib/deviceTiming';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { formatCutoffLeft } from '@/hooks/usePumpCutoff';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

/** อุปกรณ์ดับหมด — ต้องเริ่มจากพัดลมดับ ไม่งั้นตัวตามจะเปิดปั๊มให้ก่อนที่ผู้ใช้จะกด */
const idleDevices = INITIAL_DEVICES.map((d) => ({ ...d, on: false }));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider initialDevices={idleDevices}>{children}</FarmStateProvider>
);
Wrapper.displayName = 'PumpCutoffWrapper';

function useHarness() {
  const confirm = useConfirm();
  const { flash } = useToast();
  const command = useDeviceCommand({ t: TH, temp: 28, confirm, flash });
  return { farm: useFarmState(), command, confirm };
}

describe('auto-cutoff ปั๊ม — เฉพาะตอนกดเปิดเอง และต้องบอกล่วงหน้า', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('พัดลมดับ + ปั๊มดับ → ไม่มีการนับถอยหลัง', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: Wrapper });
    expect(result.current.farm.pumpCutoffAt).toBeNull();
  });

  it('ผู้ใช้กดเปิดปั๊มเอง → เริ่มนับถอยหลังทันที และรู้เวลาที่จะตัด', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: Wrapper });

    act(() => result.current.command.press('pump'));
    act(() => result.current.confirm.accept());
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));

    const at = result.current.farm.pumpCutoffAt;
    expect(at, 'กดเองแล้วต้องรู้ว่าจะตัดเมื่อไหร่').not.toBeNull();
    // นับเต็ม 20 นาทีตั้งแต่วินาทีที่ปั๊มเริ่มเดินจริง
    expect(formatCutoffLeft((at ?? 0) - Date.now())).toBe('20:00');
    expect(result.current.farm.pumpCutoffCount).toBe(0);
  });

  it('ครบเวลา → ปั๊มดับ + เพิ่มตัวนับให้หน้าจอเด้ง toast + เขียนบันทึก', () => {
    const { result } = renderHook(() => useHarness(), { wrapper: Wrapper });

    act(() => result.current.command.press('pump'));
    act(() => result.current.confirm.accept());
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));

    act(() => void vi.advanceTimersByTime(PUMP_CUTOFF_MS));
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS));

    expect(result.current.command.devices.find((d) => d.id === 'pump')?.on).toBe(false);
    expect(result.current.farm.pumpCutoffCount, 'สัญญาณให้หน้าจอเด้ง toast').toBe(1);
    expect(result.current.farm.pumpCutoffAt, 'ตัดไปแล้ว เลิกนับ').toBeNull();
    expect(result.current.command.log[0]?.key).toBe('logPumpCutoff');
  });
});
