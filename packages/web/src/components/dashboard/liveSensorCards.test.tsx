import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import type { LiveField } from '@/config/telemetryKeys';
import { DEFAULT_THRESHOLDS, SOIL_STUCK_VALUE } from '@/data/dashboard';
import type { LiveSensors } from '@/hooks/useDashboardData';
import { SensorCards } from './SensorCards';

/**
 * การ์ดเซนเซอร์ต้องบอกได้ว่าเลขบนใบนั้น "วัดมาจริง" หรือ "จำลอง"
 *
 * ต้นแบบตั้งใบดินไว้เป็นเซนเซอร์ค่าค้าง (24% ไม่ขยับ) เพื่อโชว์ปุ่มลองอ่านใหม่
 * พอมีเซนเซอร์จริงแล้ว ค่านั้นกลายเป็นเลขปลอมที่ทับค่าจริง — เทสนี้กันไม่ให้กลับไปเป็นอย่างนั้น
 */
const base: LiveSensors = {
  temp: 28.6,
  hum: 66,
  light: 41,
  soil: null,
  liveFields: new Set<LiveField>(),
  trail: {},
  updatedAt: null,
};

function renderCards(live: Partial<LiveSensors>) {
  return render(
    <I18nProvider>
      <SensorCards
        live={{ ...base, ...live }}
        loading={false}
        thresholds={DEFAULT_THRESHOLDS}
        onOpenThreshold={() => undefined}
        onRetry={() => undefined}
        animate={false}
      />
    </I18nProvider>,
  );
}

describe('SensorCards กับข้อมูลสด', () => {
  it('ยังไม่มีค่าจริงเลย → ไม่ต้องแปะป้าย "จำลอง" ทุกใบ (ป้ายบน header บอกไว้แล้ว)', () => {
    renderCards({});
    expect(screen.queryByText(TH.simTag)).not.toBeInTheDocument();
    expect(screen.queryByText(TH.liveTag)).not.toBeInTheDocument();
  });

  it('มีค่าจริงบางส่วน → ใบที่จริงติดป้ายค่าจริง ใบที่ยังจำลองติดป้ายจำลอง', () => {
    renderCards({ liveFields: new Set<LiveField>(['temp', 'rh']) });

    // อุณหภูมิ + ความชื้นอากาศเป็นของจริง · แสงกับดินยังจำลอง
    expect(screen.getAllByText(TH.liveTag)).toHaveLength(2);
    expect(screen.getAllByText(TH.simTag)).toHaveLength(2);
  });

  it('ใบดินใช้ค่าค้างของต้นแบบตอนไม่มีเซนเซอร์ และมีปุ่มลองอ่านใหม่', () => {
    renderCards({});
    expect(screen.getByText(String(SOIL_STUCK_VALUE))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TH.retry })).toBeInTheDocument();
    expect(screen.getByText(TH.stale)).toBeInTheDocument();
  });

  it('มีเซนเซอร์ดินจริง → ใช้ค่าจริง และเลิกเรียกว่าค่าค้าง (ปุ่มลองอ่านใหม่ต้องหาย)', () => {
    renderCards({ soil: 47, liveFields: new Set<LiveField>(['soil']) });

    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.queryByText(String(SOIL_STUCK_VALUE))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TH.retry })).not.toBeInTheDocument();
    expect(screen.queryByText(TH.stale)).not.toBeInTheDocument();
  });

  it('เส้นแนวโน้มของใบที่เป็นค่าจริง ใช้ค่าจริงย้อนหลัง ไม่ใช่ตัวเลขฝังไว้ของต้นแบบ', () => {
    const { container } = renderCards({
      liveFields: new Set<LiveField>(['temp']),
      trail: { temp: [27, 28, 29, 30] },
    });

    /*
     * Sparkline วาดเป็น <polyline points="…"> — จุดเดียวที่ยืนยันได้ว่าใช้ข้อมูลชุดไหน
     * ชุดของต้นแบบคือ [30,31,30,32,33,32,31,31] (8 จุด) ของจริงมี 4 จุด
     */
    const points = [...container.querySelectorAll('polyline')].map(
      (el) => (el.getAttribute('points') ?? '').trim().split(/\s+/).length,
    );
    expect(points).toContain(4);
  });

  it('ค่าจริงย้อนหลังน้อยกว่า 3 จุดยังไม่ใช้ — 2 จุดได้เส้นตรงเสมอ ดูเหมือนเซนเซอร์นิ่ง', () => {
    const { container } = renderCards({
      liveFields: new Set<LiveField>(['temp']),
      trail: { temp: [27, 28] },
    });

    const points = [...container.querySelectorAll('polyline')].map(
      (el) => (el.getAttribute('points') ?? '').trim().split(/\s+/).length,
    );
    expect(points).not.toContain(2);
  });
});
