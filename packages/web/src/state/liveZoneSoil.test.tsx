import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { UseTelemetryResult } from '@/hooks/useTelemetry';
import { I18nProvider } from '@/i18n/I18nProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { resetLiveStatusForTest } from '@/state/liveStatus';
import { ZoneStatusStrip } from '@/components/dashboard/ZoneStatusStrip';

/**
 * ความชื้นดินจริงต้องไปถึง **ทุกจุดที่แสดง** ไม่ใช่แค่การ์ดดินใบเดียว
 *
 * บั๊กที่จับ: เดิม `DASH_ZONES[].moisture` / `IRR_ZONES[].moisture` ฝังเลขไว้ (48/24/34…)
 * ค่าจริงจากเซนเซอร์ตัวเดียว (`soil_moisture`) จึงไปไม่ถึงแถบสถานะโซนกับแผนที่ชลประทาน
 * → บนแดชบอร์ดหน้าเดียวกัน การ์ดดินขึ้นค่าจริงแต่แถบโซนขึ้นค่าฝัง (เลขเดียวกันสองค่า)
 *
 * ใช้ค่าจริงจาก `handysense-farm` (`soil_moisture = 99`, ยืนยันจาก WebSocket จริง)
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

const renderStrip = () =>
  render(
    <I18nProvider>
      <FarmStateProvider>
        <RailStateProvider>
          <ZoneStatusStrip irrigationReady onOpenZone={() => undefined} />
        </RailStateProvider>
      </FarmStateProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  mocks.live.value = {};
  mocks.status.value = 'mock';
  resetLiveStatusForTest();
});
afterEach(() => resetLiveStatusForTest());

describe('ความชื้นดินจริง → แถบสถานะโซน (แดชบอร์ด)', () => {
  it('ยังไม่ต่อจริง → ใช้ค่า mock เดิมของ DASH_ZONES (fallback ตามกฎ)', () => {
    renderStrip();
    // ค่า mock เดิมมีหลายค่าไม่เท่ากัน (48/24/34…) — อย่างน้อยต้องมีเลขที่ไม่ใช่ 99
    const cards = screen.getAllByRole('button');
    const texts = cards.map((c) => c.textContent ?? '');
    expect(texts.some((t) => /\b99\b/.test(t))).toBe(false);
  });

  it('ต่อจริงแล้ว → ทุกโซนขึ้นค่าจริงเท่ากัน (เซนเซอร์ตัวเดียวทั้งฟาร์ม)', () => {
    mocks.status.value = 'live';
    mocks.live.value = { soil_moisture: tv('99') };
    renderStrip();

    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(8);
    // ทั้ง 8 การ์ดต้องมี "99" ไม่ใช่ค่าฝังเดิม 48/24/34
    for (const card of cards) {
      expect(within(card).getByText('99')).toBeInTheDocument();
    }
    // ต้องไม่มีค่าฝังเดิมหลงเหลือ
    expect(screen.queryByText('48')).not.toBeInTheDocument();
    expect(screen.queryByText('24')).not.toBeInTheDocument();
  });

  it('ระดับ (สี) คิดจากค่าจริง ไม่ใช่ค่าฝัง — 99% ไม่มีโซนไหนวิกฤต', () => {
    mocks.status.value = 'live';
    mocks.live.value = { soil_moisture: tv('99') };
    renderStrip();

    // เดิม strawberry ฝัง level: 'crit' — ค่าจริง 99% ต้องไม่มีการ์ดไหน data-level=crit
    const crit = document.querySelectorAll('[data-level="crit"]');
    expect(crit).toHaveLength(0);
  });

  it('ดินแห้งจริง → ระดับสะท้อนตามจริง (ไม่ใช่ปักไว้ว่าปกติ)', () => {
    mocks.status.value = 'live';
    mocks.live.value = { soil_moisture: tv('15') }; // ต่ำกว่า crit 20
    renderStrip();

    const crit = document.querySelectorAll('[data-level="crit"]');
    expect(crit.length).toBe(8); // ทุกโซนวิกฤตเพราะเซนเซอร์ตัวเดียวบอก 15%
  });
});
