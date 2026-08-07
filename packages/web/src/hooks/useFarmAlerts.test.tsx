import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { UseTelemetryResult } from '@/hooks/useTelemetry';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import { NOTIFICATIONS } from '@/data/dashboard';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { resetLiveStatusForTest } from '@/state/liveStatus';
import { useFarmAlerts } from './useFarmAlerts';

/**
 * แจ้งเตือน **อิงค่าจริงเมื่อ live · mock เมื่อ token หมด** (โจทย์หลักของงานนี้)
 */
const mocks = vi.hoisted(() => ({
  live: { value: {} as Record<string, TelemetryValue> },
  status: { value: 'mock' as UseTelemetryResult['connectionStatus'] },
  alarms: { value: [] as UseTelemetryResult['alarms'] },
}));

vi.mock('@/hooks/useTelemetry', () => ({
  useTelemetry: (): UseTelemetryResult => ({
    live: mocks.live.value,
    attributes: {},
    history: {},
    alarms: mocks.alarms.value,
    connectionStatus: mocks.status.value,
    lastUpdateAt: mocks.status.value === 'live' ? Date.now() : null,
    errorMessage: null,
  }),
  useAccessToken: () => null,
}));

const tv = (v: string): TelemetryValue => ({ value: v, timestamp: Date.now() });

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>
    <FarmStateProvider>
      <RailStateProvider>{children}</RailStateProvider>
    </FarmStateProvider>
  </I18nProvider>
);

const run = () => renderHook(() => useFarmAlerts(), { wrapper }).result;

beforeEach(() => {
  mocks.live.value = {};
  mocks.status.value = 'mock';
  mocks.alarms.value = [];
  resetLiveStatusForTest();
});
afterEach(() => resetLiveStatusForTest());

describe('useFarmAlerts', () => {
  it('token หมด/ยังไม่ล็อกอิน → ใช้ mock NOTIFICATIONS', () => {
    const r = run();
    expect(r.current.isLive).toBe(false);
    expect(r.current.count).toBe(NOTIFICATIONS.length);
  });

  it('ต่อจริง + ค่าปกติ → ไม่มีแจ้งเตือน (ไม่เอาข้อความ mock มาโชว์)', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('27'), humidity: tv('70'), light: tv('30') };
    const r = run();
    expect(r.current.isLive).toBe(true);
    expect(r.current.count).toBe(0);
    expect(r.current.topCritical).toBeNull();
  });

  it('ต่อจริง + ค่าจริงหลุดเกณฑ์ → แจ้งเตือนจากค่าจริง', () => {
    mocks.status.value = 'live';
    // temp 36 (ร้อนวิกฤต) · light 3 (แสงน้อย) · soil 99 (เปียกเกิน)
    mocks.live.value = {
      temperature: tv('36.29'),
      humidity: tv('72'),
      light: tv('3.23'),
      soil_moisture: tv('99'),
    };
    const r = run();
    expect(r.current.isLive).toBe(true);
    expect(r.current.count).toBe(3);
    // อุณหภูมิ 36 = วิกฤต → มี topCritical และข้อความอ้างชื่อค่าจริง
    expect(r.current.topCritical).not.toBeNull();
    expect(r.current.topCritical?.text).toContain(TH.senTemp);
  });

  it('ข้อความเตือนมาจากค่าจริง ไม่ใช่คีย์ mock', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('36.29'), humidity: tv('70'), light: tv('30') };
    const r = run();
    // ต้องไม่มีข้อความ mock เดิม (เซนเซอร์ดินโซน B ค้าง)
    expect(r.current.items.some((i) => i.text === TH.n1)).toBe(false);
    expect(r.current.items[0]?.text).toContain('36.3');
  });

  it('แจ้งเตือนจาก backend (alarm) แสดง และวิกฤตขึ้นก่อนแจ้งเตือนที่เราคำนวณ', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('33'), humidity: tv('70'), light: tv('30') }; // temp 33 = warn
    mocks.alarms.value = [
      {
        entityId: { entityType: 'DEVICE', id: 'd1' },
        createdTime: 1700,
        type: 'High temperature',
        severity: 'CRITICAL',
        status: 'ACTIVE_UNACK',
        originatorName: 'handysense-farm',
        acknowledgedTime: null,
        clearedTime: null,
      },
    ];
    const r = run();
    // alarm วิกฤตต้องอยู่บนสุด · มีทั้ง alarm และ derived warn
    expect(r.current.topCritical?.text).toBe('High temperature');
    expect(r.current.count).toBe(2);
  });

  it('alarm ที่ CLEARED แล้วไม่แสดง (หายแล้ว)', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: tv('27'), humidity: tv('70'), light: tv('30') };
    mocks.alarms.value = [
      {
        entityId: { entityType: 'DEVICE', id: 'd1' },
        createdTime: 1700,
        type: 'Old alarm',
        severity: 'MAJOR',
        status: 'CLEARED_ACK',
        originatorName: 'handysense-farm',
        acknowledgedTime: 1800,
        clearedTime: 1900,
      },
    ];
    const r = run();
    expect(r.current.count).toBe(0);
  });
});
