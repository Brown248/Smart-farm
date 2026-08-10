import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LED_CONFIRM_TIMEOUT_MS, PUMP_CUTOFF_MS, SEND_LATENCY_MS } from '@/lib/deviceTiming';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

/**
 * auto-cutoff ปั๊ม 20 นาที (safety แทน guard G1 ที่ถอดออก) — **โหมดจริง**
 *
 * ของเดิมตั้ง `on:false` ในเครื่องหลัง 1.7 วิ แต่ `led2` จริงตามมาช้า ~8 วิ
 * reconcile จึงเห็น led=true vs on=false → ตีเป็น "led เปลี่ยน" แล้วเด้งปั๊มกลับเป็น "เปิด"
 * ทั้ง 8 แปลงกลับไปเป็น "กำลังรดน้ำ" ทั้งที่ระบบเพิ่งบันทึกว่าตัดการทำงานไปแล้ว
 */
const mkAttrs = (rec: Record<string, string>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { value: v, timestamp: 1 }]));

function wrapper(attrs: Record<string, string>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <FarmStateProvider forceRealControl forceAttributes={mkAttrs(attrs)}>
      {children}
    </FarmStateProvider>
  );
  Wrapper.displayName = 'PumpCutoffWrapper';
  return Wrapper;
}

describe('auto-cutoff ปั๊ม (โหมดจริง)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ครบเวลา → รดน้ำหยุดทันทีและ **ไม่เด้งกลับ** ระหว่างรอ led จริงยืนยัน', () => {
    // led2=true → ปั๊มเดินอยู่จริง (reconcile เอาค่านี้มาใส่ Device.on)
    const { result } = renderHook(() => useFarmState(), { wrapper: wrapper({ led2: 'true' }) });
    const pump = () => result.current.devices.find((d) => d.id === 'pump');

    expect(pump()?.on).toBe(true);
    expect(result.current.watering).toBe(true);

    // ครบ 20 นาที → สั่งปิด · pending ทำให้ `deviceRunning()` เป็น false ทันที
    act(() => void vi.advanceTimersByTime(PUMP_CUTOFF_MS));
    expect(pump()?.pending).toBe('off');
    expect(result.current.watering).toBe(false);
    expect(result.current.log[0]?.key).toBe('logPumpCutoff');

    /*
     * จุดที่ของเดิมพัง: เลยจังหวะ settle ของโหมดจำลองไปแล้ว แต่ led2 จริงยังเป็น true อยู่
     * ห้ามตั้ง on:false เองแล้วปล่อยให้ reconcile เด้งกลับเป็น "เปิด"
     */
    act(() => void vi.advanceTimersByTime(SEND_LATENCY_MS * 2));
    expect(result.current.watering).toBe(false);
    expect(pump()?.pending).toBe('off');
  });

  it('led ไม่ยืนยันเลย → ปลด pending กันค้าง (ไม่ล็อกปุ่มไว้ตลอดกาล)', () => {
    const { result } = renderHook(() => useFarmState(), { wrapper: wrapper({ led2: 'true' }) });
    const pump = () => result.current.devices.find((d) => d.id === 'pump');

    act(() => void vi.advanceTimersByTime(PUMP_CUTOFF_MS));
    expect(pump()?.pending).toBe('off');

    act(() => void vi.advanceTimersByTime(LED_CONFIRM_TIMEOUT_MS));
    expect(pump()?.pending).toBeNull();
  });
});
