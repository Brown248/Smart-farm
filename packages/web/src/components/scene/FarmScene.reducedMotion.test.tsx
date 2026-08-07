import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES } from '@/routePaths';
import { setReducedMotion } from '@/test/setup';
import { FarmScene } from './FarmScene';

/**
 * ล็อกอากาศ = กลางวัน ไม่มีฝน → เทสอนุภาค (mote เฉพาะกลางวัน) ไม่ผูกกับนาฬิกาเครื่องรัน
 */
vi.mock('@/hooks/useWeather', () => ({
  useWeather: () => ({
    tempC: 29,
    humidity: 60,
    code: 0,
    isDay: true,
    precipitationMm: 0,
    isRaining: false,
    daily: [],
    fetchedAt: 0,
  }),
}));

function renderScene() {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <MemoryRouter initialEntries={[ROUTES.farm]}>
          <FarmScene />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

/** DoD: prefers-reduced-motion: reduce แล้ว animation ต่อเนื่องต้องหยุดจริง */
describe('FarmScene · prefers-reduced-motion', () => {
  it('ปกติ: มีเลเยอร์อนุภาคที่เคลื่อนไหวต่อเนื่อง', () => {
    setReducedMotion(false);
    const { container } = renderScene();
    expect(container.querySelectorAll('[data-effect="mote"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-effect="birds"]')).not.toBeNull();
  });

  it('เมื่อผู้ใช้ขอลดการเคลื่อนไหว: ไม่สร้างเลเยอร์อนุภาคเลย', () => {
    setReducedMotion(true);
    const { container } = renderScene();

    expect(container.querySelectorAll('[data-effect="mote"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-effect="firefly"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-effect="steam"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-effect="drip"]')).toHaveLength(0);
    expect(container.querySelector('[data-effect="birds"]')).toBeNull();
    expect(container.querySelector('[data-effect="heat"]')).toBeNull();
  });

  it('เมื่อลดการเคลื่อนไหว: ข้อความ agent ขึ้นเต็มทันที ไม่ต้องรอพิมพ์ทีละตัว', () => {
    setReducedMotion(true);
    renderScene();
    // ทุกโซนไม่ได้เขียวหมด (สตรอเบอร์รี่วิกฤต) → ข้อความคือ aCrit
    const bubble = screen.getByRole('status', { name: '' });
    expect(bubble.textContent).toContain(TH.agentName);
    expect(bubble.textContent?.length).toBeGreaterThan(TH.agentName.length + 10);
  });

  it('เมื่อลดการเคลื่อนไหว: ตัวละครไม่มี animation เข้าท่า', () => {
    setReducedMotion(true);
    renderScene();
    const bear = screen.getByAltText(TH.agentName);
    expect(bear.getAttribute('style') ?? '').not.toContain('fsPoseIn');
  });

  /**
   * ฝนเปิดอยู่คือกรณีที่หนักที่สุด — หยดน้ำกับวงกระเพื่อมต้องหายไปทั้งหมด
   * ไม่ใช่แค่ค้างนิ่งกลางจอ เพราะวงที่ค้างจะกลายเป็นจุดขาวบนกระจก
   */
  it('เมื่อลดการเคลื่อนไหว: เปิดฝนแล้วยังต้องไม่มีหยดน้ำ/วงกระเพื่อม', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    const { container } = renderScene();

    await user.click(screen.getByRole('button', { name: TH.menuTitle }));
    // เริ่มที่โหมด auto (ตามจริง = ไม่ตก) กดครั้งเดียว → บังคับฝนตก
    await user.click(await screen.findByRole('button', { name: TH.rainAuto }));
    expect(await screen.findByText(TH.rainChip)).toBeInTheDocument();

    expect(container.querySelectorAll('[data-effect="drip"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-effect="impact"]')).toHaveLength(0);
  });

  it('เปิดฝน: มีหยดน้ำบนกระจกหลังคา + ป้ายฝน แต่ไม่มีฝนกระทบพื้น (ไม่ให้ดูเหมือนตกในโรงเรือน)', async () => {
    // เจ้าของงานขอ "หยดน้ำบนกระจกหลังคา" กลับมา · ถอดฝนกระทบพื้น/เม็ดฝนที่ซ้อนกลางฉากออก
    setReducedMotion(false);
    const user = userEvent.setup();
    const { container } = renderScene();

    await user.click(screen.getByRole('button', { name: TH.menuTitle }));
    // เริ่มที่โหมด auto (ตามจริง = ไม่ตก) กดครั้งเดียว → บังคับฝนตก
    await user.click(await screen.findByRole('button', { name: TH.rainAuto }));
    expect(await screen.findByText(TH.rainChip)).toBeInTheDocument();

    // หยดน้ำบนกระจกกลับมาแล้ว · ฝนกระทบพื้น (impact) ยังเอาออก
    expect(container.querySelectorAll('[data-effect="drip"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-effect="impact"]')).toHaveLength(0);
  });

  it('เลเยอร์ตกแต่งทุกตัวต้อง aria-hidden', () => {
    setReducedMotion(false);
    const { container } = renderScene();
    const layers = container.querySelectorAll('[data-effect]');
    expect(layers.length).toBeGreaterThan(0);
    for (const el of layers) {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
