import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { UseTelemetryResult } from '@/hooks/useTelemetry';
import type * as HsControl from '@/services/handysenseControl';

/**
 * ระบบดูดอากาศออกตามความชื้น **สั่ง relay จริงหรือเปล่า**
 *
 * 🔴 ก่อนมีเทสนี้ระบบความชื้นถูกคุมด้วยเทส 2 ตัวที่**ไม่แตะเครื่องยนต์เลย**:
 *   `lib/humidityVent.test.ts`     ทดสอบ `nextVent` ซึ่งเป็น pure function — คำนวณ stage ถูกไหม
 *   `pages/HumidityBanner.test.tsx` ทดสอบแบนเนอร์ — ปุ่ม/ข้อความบนจอถูกไหม
 * ทั้งคู่ผ่านได้ 100% แม้ตัว engine ใน `FarmStateProvider` จะไม่ยิง `setSwitch` สักคำสั่ง
 * เป็นรูปแบบเดียวกับที่ CLAUDE.md บันทึกไว้ว่าเคยเกิด: "ฟังก์ชันมันถูก — ที่ผิดคือไม่มีใครเรียก"
 *
 * เทสนี้จึงขับของจริงทั้งเส้น: ค่า RH จาก telemetry → provider → POST ออกไปที่ backend
 */
const mocks = vi.hoisted(() => ({
  live: { value: {} as Record<string, TelemetryValue> },
}));

vi.mock('@/hooks/useTelemetry', () => ({
  useTelemetry: (): UseTelemetryResult => ({
    live: mocks.live.value,
    attributes: {},
    history: {},
    alarms: [],
    connectionStatus: 'live',
    lastUpdateAt: 1_700_000_000_000,
    errorMessage: null,
  }),
  useAccessToken: () => null,
}));

vi.mock('@/services/handysenseControl', async (importOriginal) => {
  const actual = await importOriginal<typeof HsControl>();
  return {
    ...actual,
    readHsContext: () => ({ apiBase: 'https://x/api/v1', deviceId: 'dev', token: 'tok' }),
    postHsCommand: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  HUM_MIN_RUN_MS,
  HUM_STAGE_DELAY_MS,
  HUM_TICK_MS,
  HUM_MAX_RUN_MS,
} from '@/lib/deviceTiming';
import { postHsCommand } from '@/services/handysenseControl';
import { resetLiveStatusForTest } from '@/state/liveStatus';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

const tv = (v: number): TelemetryValue => ({ value: String(v), timestamp: 1_700_000_000_000 });

/**
 * ตั้งค่าที่ "วัดมาจริง" — ต้องเป็นออบเจกต์ใหม่ทุกครั้ง ไม่งั้น useMemo ของ provider ไม่คำนวณใหม่
 *
 * ต้องป้อน **อุณหภูมิจริงด้วย** ไม่ใช่แค่ RH — ค่าจำลองเริ่มต้นคือ 33.4°C ซึ่งสูงกว่า
 * `BIG_FAN_LOCK_TEMP` (33) ทำให้ G2 คงใบใหญ่ #1 ไว้เสมอ แล้วเทสฝั่ง "สั่งปิด" จะพังโดยที่โค้ดถูก
 */
function setLive(rh: number, temp = 28): void {
  mocks.live.value = { humidity: tv(rh), temperature: tv(temp) };
}

const Wrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl>{children}</FarmStateProvider>
);
Wrapper.displayName = 'VentEngineWrapper';

/** คำสั่ง setSwitch ที่ยิงไปช่องหนึ่ง เรียงตามเวลา (`true`/`false`) */
const switchesTo = (ch: number): boolean[] =>
  vi
    .mocked(postHsCommand)
    .mock.calls.filter(([, cmd]) => cmd.action === 'setSwitch' && cmd.channel === ch)
    .map(([, cmd]) => (cmd as { on: boolean }).on);

/** คำสั่งล่าสุดของช่องนั้น — `undefined` = ไม่เคยถูกสั่งเลย */
const lastSwitch = (ch: number): boolean | undefined => switchesTo(ch).at(-1);

/**
 * ตัวขับเทส — **แยก "เปลี่ยน state" กับ "เดินเวลา" ออกคนละ `act` เสมอ**
 * ถ้ารวมไว้ก้อนเดียว timer จะยิงก่อน React commit ค่าใหม่ → tick อ่านค่าเก่า แล้วเทสหลอกว่าพัง
 */
function harness() {
  const { result, rerender } = renderHook(() => useFarmState(), { wrapper: Wrapper });
  const wait = async (ms: number): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  return {
    result,
    stage: (): number => result.current.humidityVentStage,
    /** เปิด/ตั้งค่าระบบ แล้วรอให้ React commit ก่อนค่อยเดินเวลา */
    enable: async (patch: Parameters<typeof result.current.setHumidityAuto>[0] = {}) => {
      await act(async () => {
        result.current.setHumidityAuto({ enabled: true, ...patch });
      });
    },
    /** ป้อน RH ใหม่จากเซนเซอร์จริง แล้วเดินเวลา */
    rh: async (value: number, ms: number, temp = 28) => {
      setLive(value, temp);
      await act(async () => {
        rerender();
      });
      await wait(ms);
    },
    wait,
  };
}

describe('เครื่องยนต์ดูดอากาศตามความชื้น — สั่ง relay จริง', () => {
  beforeEach(() => {
    resetLiveStatusForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00+07:00'));
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
    setLive(60);
  });
  afterEach(() => {
    vi.useRealTimers();
    resetLiveStatusForTest();
  });

  it('ชื้นเกินเกณฑ์ → เปิดพัดลมใหญ่ #1 (ch0) จริง · แห้งลงแล้ว → สั่งปิดจริง', async () => {
    const h = harness();

    // เปิดระบบ (ค่าเริ่มต้น onAt 85 / offAt 70) ตอน RH 60 → ยังไม่ต้องดูด
    await h.enable();
    await h.wait(HUM_TICK_MS);
    expect(lastSwitch(0), 'RH ต่ำกว่าเกณฑ์ ห้ามสั่งเปิด').toBeUndefined();

    // ชื้นทะลุ 85 → รอบประเมินถัดไปต้องเปิดใบใหญ่ #1
    await h.rh(92, HUM_TICK_MS);
    expect(lastSwitch(0)).toBe(true);
    expect(h.stage()).toBe(1);

    // ยังชื้นอยู่หลังพ้น STAGE_DELAY → เสริมใบใหญ่ #2 (ch1)
    await h.wait(HUM_STAGE_DELAY_MS + HUM_TICK_MS);
    expect(lastSwitch(1)).toBe(true);
    expect(h.stage()).toBe(2);

    // แห้งลงต่ำกว่า offAt แล้วพ้น MIN_RUN → ต้องสั่งปิดทั้งสองใบจริง
    await h.rh(64, HUM_MIN_RUN_MS + HUM_TICK_MS);
    expect(lastSwitch(0)).toBe(false);
    expect(lastSwitch(1)).toBe(false);
    expect(h.stage()).toBe(0);
  });

  it('ปิดสวิตช์ระบบเอง → ดับพัดลมทันที ไม่ต้องรอรอบประเมินถัดไป', async () => {
    setLive(92);
    const h = harness();
    const result = h.result;

    await h.enable();
    await h.wait(HUM_TICK_MS);
    expect(lastSwitch(0)).toBe(true);

    // กล่องยืนยันบอกผู้ใช้ว่า "จะดับพัดลม" → ต้องดับตรงนั้น ไม่ใช่ยืนงงรอ 20 วิ
    await act(async () => {
      result.current.setHumidityAuto({ enabled: false });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastSwitch(0)).toBe(false);
    expect(result.current.humidityVentStage).toBe(0);
  });

  it('ไม่มีเซนเซอร์ความชื้นจริง → ห้ามสั่ง relay เลย (ห้ามเดาจากค่าจำลอง)', async () => {
    mocks.live.value = {}; // ไม่มี rh ที่วัดมาจริง — climate.rh ยังเดินค่าจำลองอยู่
    const h = harness();

    await h.enable();
    await h.wait(HUM_TICK_MS * 3);
    expect(vi.mocked(postHsCommand)).not.toHaveBeenCalled();
  });

  it('เกณฑ์กลับหัว (เปิดต่ำกว่าปิด) → engine ต้องไม่สั่งอะไรเลย ไม่ใช่เปิด-ปิดรัวๆ', async () => {
    setLive(92);
    const h = harness();

    await h.enable({ onAt: 60, offAt: 80 });
    await h.wait(HUM_TICK_MS * 3);
    expect(vi.mocked(postHsCommand)).not.toHaveBeenCalled();
  });

  it('ดูดต่อเนื่องจนครบเวลาสูงสุดแล้วยังไม่ลง → ตัดพักจริง (ดูดไม่ลง = ข้างนอกก็ชื้น)', async () => {
    setLive(92);
    const h = harness();

    await h.enable();
    await h.wait(HUM_TICK_MS);
    expect(lastSwitch(0)).toBe(true);

    await h.wait(HUM_MAX_RUN_MS + HUM_TICK_MS);
    expect(lastSwitch(0)).toBe(false);
    expect(h.stage()).toBe(0);
  });

  /**
   * G2 ในตัว engine — เครื่องมือความชื้นยิง `setSwitch` ตรง จึงข้าม `guard()` ปกติ
   * ถ้าไม่เช็คเองตรงนี้ พอ RH ลงมาแล้วมันจะดับใบใหญ่ทั้งคู่ทั้งที่ยังร้อนเกิน 33°C
   * = ปิดทางระบายความร้อนตัวสุดท้ายโดยไม่มีใครสั่ง (เป็นกฎที่ `lib/guards.ts` ห้ามไว้)
   */
  it('RH ลงแล้วแต่ยังร้อนเกิน 33°C → หยุดดูด แต่คงใบใหญ่ #1 ไว้ระบายความร้อน (G2)', async () => {
    const h = harness();
    await h.enable();
    await h.rh(92, HUM_TICK_MS, 36);
    expect(lastSwitch(0)).toBe(true);

    // แห้งลงจนต่ำกว่า offAt แล้ว — ปกติต้องดับทั้งคู่ แต่ยัง 36°C
    await h.rh(64, HUM_MIN_RUN_MS + HUM_STAGE_DELAY_MS + HUM_TICK_MS, 36);
    expect(h.stage(), 'เลิกดูดแล้ว').toBe(0);
    expect(lastSwitch(1), 'ใบใหญ่ #2 ดับได้ — ไม่ใช่ตัวสุดท้าย').toBe(false);
    expect(lastSwitch(0), 'ใบใหญ่ #1 ต้องยังหมุนอยู่ ขณะอุณหภูมิเกินเกณฑ์').toBe(true);
  });
});
