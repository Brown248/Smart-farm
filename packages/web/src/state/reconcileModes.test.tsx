import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { Attributes } from '@/config/deviceAttributes';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

/** ค่าจริงมาเป็น string ทุกตัว */
function attrs(rec: Record<string, string>): Attributes {
  const out: Record<string, TelemetryValue> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = { value: v, timestamp: 1000 };
  return out;
}

// ch0 (big1): led on + มีเกณฑ์อุณหภูมิ → auto · ch1 (big2): led off + ไม่มีเกณฑ์ → manual
const A = attrs({
  led0: 'true',
  min_temp0: '30',
  max_temp0: '35',
  min_soil0: '0',
  max_soil0: '0',
  led1: 'false',
  min_temp1: '0',
  max_temp1: '0',
  min_soil1: '0',
  max_soil1: '0',
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl forceAttributes={A}>
    {children}
  </FarmStateProvider>
);

describe('FarmStateProvider — reconcile จากอุปกรณ์จริง', () => {
  it('modes ต้องเดินคู่กับ Device.auto เสมอ (Finding 2): ch0 มีเกณฑ์=auto · ch1 ไม่มี=manual', () => {
    const { result } = renderHook(() => useFarmState(), { wrapper });
    const big1 = result.current.devices.find((d) => d.id === 'big1');
    const big2 = result.current.devices.find((d) => d.id === 'big2');
    // สองค่านี้เคยขัดกันได้ (reconcile แก้ Device.auto แต่ไม่แตะ modes) → คนอ่าน modes จะโกหก
    expect(big1?.auto).toBe(true);
    expect(result.current.modes.big1).toBe('auto');
    expect(big2?.auto).toBe(false);
    expect(result.current.modes.big2).toBe('manual');
  });

  it('led จริง sync เข้า Device.on (ไม่ใช่ค่า mock ตั้งต้น)', () => {
    const { result } = renderHook(() => useFarmState(), { wrapper });
    expect(result.current.devices.find((d) => d.id === 'big1')?.on).toBe(true);
    expect(result.current.devices.find((d) => d.id === 'big2')?.on).toBe(false);
  });
});
