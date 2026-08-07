import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TelemetryValue } from '@shared/telemetrySocket';
import type { UseTelemetryResult } from '@/hooks/useTelemetry';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { resetLiveStatusForTest } from '@/state/liveStatus';
import { CommandChannel } from './CommandChannel';

/**
 * `cmd_result` จริงจากอุปกรณ์ → ป้ายบอกว่าคำสั่งล่าสุดสำเร็จ/ล้มเหลว
 *
 * ปิดช่องว่าง "ส่งคำสั่งแล้ว vs อุปกรณ์ทำจริง" — ใช้ payload จริงที่ capture มา
 * (`{"ok":true,"channel":3}` · `{"ok":false,"error":"unknown error"}`)
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
    lastUpdateAt: mocks.status.value === 'live' ? Date.now() : null,
    errorMessage: null,
  }),
  useAccessToken: () => null,
}));

const cmd = (json: string): TelemetryValue => ({ value: json, timestamp: Date.now() });

const renderChip = () =>
  render(
    <I18nProvider>
      <FarmStateProvider>
        <CommandChannel />
      </FarmStateProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  mocks.live.value = {};
  mocks.status.value = 'mock';
  resetLiveStatusForTest();
});
afterEach(() => resetLiveStatusForTest());

describe('CommandChannel', () => {
  it('ยังไม่ต่อจริง → ไม่แสดงอะไร (ไม่มีผลตอบกลับให้โชว์)', () => {
    mocks.live.value = { cmd_result: cmd('{"ok":true,"channel":3}') };
    const { container } = renderChip();
    expect(container).toBeEmptyDOMElement();
  });

  it('ต่อจริง + คำสั่งล่าสุดสำเร็จ → ขึ้นว่าอุปกรณ์รับคำสั่งแล้ว', () => {
    mocks.status.value = 'live';
    mocks.live.value = { cmd_result: cmd('{"ok":true,"channel":3,"reqId":"t1"}') };
    renderChip();
    expect(screen.getByText(TH.cmdChOk)).toBeInTheDocument();
  });

  it('ต่อจริง + คำสั่งล่าสุดล้มเหลวจริง (มี reqId) → ขึ้นว่าล้มเหลว พร้อม error', () => {
    mocks.status.value = 'live';
    mocks.live.value = {
      cmd_result: cmd('{"ok":false,"error":"device busy","reqId":"t9"}'),
    };
    renderChip();
    expect(screen.getByText(TH.cmdChFail)).toBeInTheDocument();
    expect(screen.getByText(/device busy/)).toBeInTheDocument();
  });

  it('🔴 ขยะ backend ปัดตกคำสั่งผิดรูป (ไม่มี reqId/channel) → ไม่โชว์ "ล้มเหลว" ค้าง', () => {
    mocks.status.value = 'live';
    mocks.live.value = {
      cmd_result: cmd('{"ok":false,"action":"","error":"unknown error","reqId":""}'),
    };
    const { container } = renderChip();
    expect(container).toBeEmptyDOMElement();
  });

  it('ต่อจริงแต่ device ยังไม่ส่ง cmd_result → ไม่แสดง', () => {
    mocks.status.value = 'live';
    mocks.live.value = { temperature: { value: '30', timestamp: Date.now() } };
    const { container } = renderChip();
    expect(container).toBeEmptyDOMElement();
  });
});
