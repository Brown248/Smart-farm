import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { UseTelemetryResult } from '@/hooks/useTelemetry';
import { getLiveSnapshot, resetLiveStatusForTest } from '@/state/liveStatus';
import { FarmStateProvider, useFarmState } from '@/state/FarmStateProvider';

/**
 * ค่าจริงจาก WebSocket ไหลถึงหน้าจอจริงไหม
 *
 * เทสนี้จำเป็นเพราะทั้งเส้นทางเงียบได้หมด: socket ต่อติด แต่ชื่อ key ไม่ตรง →
 * `resolveClimate` คืนของว่าง → หน้าจอโชว์ค่าจำลองต่อไปโดยไม่มีอะไรฟ้อง
 * และคนดูจะเข้าใจว่านั่นคือค่าจริง ซึ่งแย่กว่าจอว่างเปล่า
 *
 * mock ที่ระดับ `useTelemetry` ไม่ใช่ที่ socket — เพราะที่ต้องการคุมคือ
 * **การแปลงข้อมูลที่ไหลมา → ค่าบนหน้าจอ** ไม่ใช่ตัว transport (มีเทสของตัวเองแล้ว)
 */
const mocks = vi.hoisted(() => ({
  live: { value: {} as Record<string, TelemetryValue> },
  status: { value: 'mock' as UseTelemetryResult['connectionStatus'] },
}));

vi.mock('@/hooks/useTelemetry', () => ({
  useTelemetry: (): UseTelemetryResult => ({
    live: mocks.live.value,
    attributes: {},
    history: {},
    alarms: [],
    connectionStatus: mocks.status.value,
    lastUpdateAt: mocks.status.value === 'live' ? 1_700_000_000_000 : null,
    errorMessage: null,
  }),
  useAccessToken: () => null,
}));

const tv = (value: string): TelemetryValue => ({ value, timestamp: 1_700_000_000_000 });

function Probe() {
  const { climate, zones, live } = useFarmState();
  return (
    <ul>
      <li data-testid="temp">{climate.temp}</li>
      <li data-testid="rh">{climate.rh}</li>
      <li data-testid="lux">{climate.lux}</li>
      <li data-testid="soil-first">{zones[0]?.soil}</li>
      <li data-testid="soil-last">{zones[zones.length - 1]?.soil}</li>
      <li data-testid="fields">{[...live.fields].sort().join(',')}</li>
      <li data-testid="status">{live.status}</li>
      <li data-testid="unmatched">{live.unmatched.join(',')}</li>
    </ul>
  );
}

const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

const renderProbe = () =>
  render(
    <FarmStateProvider>
      <Probe />
    </FarmStateProvider>,
  );

beforeEach(() => {
  mocks.live.value = {};
  mocks.status.value = 'mock';
  resetLiveStatusForTest();
});

afterEach(() => {
  resetLiveStatusForTest();
});

describe('ค่าจริงจาก telemetry → FarmStateProvider', () => {
  it('ยังไม่มีข้อมูลสด → ใช้ค่าจำลอง และไม่มีค่าไหนถูกอ้างว่าเป็นของจริง', () => {
    renderProbe();

    expect(text('fields')).toBe('');
    expect(Number(text('temp'))).toBeGreaterThan(0);
    expect(getLiveSnapshot().liveCount).toBe(0);
    expect(getLiveSnapshot().totalCount).toBe(4);
  });

  it('ค่าจริงมาแล้วต้องทับค่าจำลอง และบอกได้ว่าตัวไหนเป็นของจริง', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('26.7'), humidity: tv('68') };
    renderProbe();

    expect(text('temp')).toBe('26.7');
    expect(text('rh')).toBe('68');
    expect(text('fields')).toBe('rh,temp');
    expect(text('status')).toBe('live');
  });

  it('ค่าที่ยังไม่มีเซนเซอร์ต้องไม่ถูกนับเป็นของจริง แม้ตัวอื่นจะสดแล้ว', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('26.7') };
    renderProbe();

    // ความสว่างยังเดินค่าจำลองอยู่ — ห้ามอยู่ใน fields ไม่งั้นหน้าจอจะติดป้ายว่าวัดมาจริง
    expect(text('fields')).toBe('temp');
    expect(Number(text('lux'))).toBeGreaterThan(0);
  });

  it('ความชื้นดินจริงตัวเดียวใช้กับทุกแปลงเท่ากัน — ไม่แจกเลขต่างกันให้ดูเหมือนวัดแยก', () => {
    mocks.status.value = 'live';
    mocks.live.value = { soil_moisture: tv('43.5') };
    renderProbe();

    expect(text('soil-first')).toBe('43.5');
    expect(text('soil-last')).toBe('43.5');
    expect(text('fields')).toBe('soil');
  });

  it('รายงานสัดส่วนค่าจริงให้ป้ายบน header — ต่อติดไม่เท่ากับได้ค่าครบ', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('26.7'), humidity: tv('68'), soil: tv('40') };
    renderProbe();

    expect(getLiveSnapshot().liveCount).toBe(3);
    expect(getLiveSnapshot().totalCount).toBe(4);
  });

  it('key ที่ไม่รู้จักต้องโผล่ใน unmatched ไม่ใช่ถูกทิ้งเงียบๆ', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('26.7'), battery: tv('92') };
    renderProbe();

    expect(text('unmatched')).toBe('battery');
  });
});
