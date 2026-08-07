import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { reportDeviceFreshness, resetLiveStatusForTest } from '@/state/liveStatus';
import { StaleBanner } from './StaleBanner';

afterEach(() => resetLiveStatusForTest());

function renderBanner() {
  return render(
    <I18nProvider>
      <StaleBanner />
    </I18nProvider>,
  );
}

describe('StaleBanner', () => {
  it('อุปกรณ์สด (ไม่ stale) → ไม่โผล่แถบเตือน', () => {
    renderBanner();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('อุปกรณ์ค้าง → โผล่แถบ "ค่าค้าง" พร้อมจำนวนนาที', () => {
    renderBanner();
    act(() => reportDeviceFreshness(true, Date.now() - 3 * 60_000)); // เงียบมา ~3 นาที
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/ค่าค้าง/);
    expect(alert).toHaveTextContent(/3 นาที/);
  });

  it('กลับมาสด → แถบหายไป', () => {
    renderBanner();
    act(() => reportDeviceFreshness(true, Date.now() - 3 * 60_000));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => reportDeviceFreshness(false, Date.now()));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('อุปกรณ์ถูกระงับ (netpie_banned) → โผล่แถบ "ติดต่อผู้ดูแล" (สำคัญกว่าค่าค้าง)', () => {
    renderBanner();
    act(() => reportDeviceFreshness(true, Date.now() - 3 * 60_000, true, 0));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/ติดต่อผู้ดูแล/);
    // เป็นข้อความ banned ไม่ใช่ข้อความค่าค้างที่บอกจำนวน "นาที"
    expect(alert).not.toHaveTextContent(/นาที/);
  });
});
