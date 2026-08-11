import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { EN } from '@/i18n/en';
import { ROUTES } from '@/routePaths';
import { AppRoutes } from '@/routes';
import { FarmScene } from './FarmScene';

/**
 * ล็อกอากาศให้คงที่ = กลางวัน ไม่มีฝน → ฉากไม่ผูกกับนาฬิกา/เน็ตของเครื่องรันเทส
 * (ค่าเริ่ม lightMode='auto' จะไล่ตามเวลาไทยจริงตอนใช้งานจริง แต่เทสต้อง deterministic)
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

describe('FarmScene', () => {
  it('วาดการ์ดค่าอากาศครบ 4 ใบพร้อมวงแหวน', () => {
    renderScene();
    expect(screen.getAllByTestId('gauge')).toHaveLength(3);
    expect(screen.getByText(TH.hudTemp)).toBeInTheDocument();
    expect(screen.getByText(TH.hudRh)).toBeInTheDocument();
    expect(screen.getByText(TH.hudLux)).toBeInTheDocument();
    // CO₂ ถูกตัดออก — ฟาร์มไม่มีเซนเซอร์ CO₂ (คีย์แปลยังอยู่เพราะเป็น 1 ใน 168 คีย์ฉากเกม)
    expect(screen.queryByText(TH.hudCo2)).not.toBeInTheDocument();
  });

  it('มีพื้นที่กดครบ 8 โซน', () => {
    renderScene();
    for (const name of [
      TH.zKale,
      TH.zFlower,
      TH.zRosemary,
      TH.zMushroom,
      TH.zLettuce,
      TH.zCucumber,
      TH.zStrawberry,
      TH.zTomato,
    ]) {
      expect(screen.getByRole('button', { name: TH.zonePrefix + name })).toBeInTheDocument();
    }
  });

  it('โซนวิกฤต/ต่ำมีป้ายค่า ส่วนโซนปกติเป็นหมุดเปล่า', () => {
    renderScene();
    // สตรอเบอร์รี่เริ่มที่สถานะวิกฤต · มะเขือเทศต่ำกว่าเกณฑ์ → ต้องมีป้าย
    expect(screen.getByText(new RegExp(`^${TH.zStrawberry}\\s+\\d+%$`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${TH.zTomato}\\s+\\d+%$`))).toBeInTheDocument();
    // ผักเคลปกติ → ไม่มีป้ายค่า
    expect(screen.queryByText(new RegExp(`^${TH.zKale}\\s+\\d+%$`))).not.toBeInTheDocument();
  });

  it('แตะแปลงแล้วเปิดแผ่นรายละเอียดโซน', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: TH.zonePrefix + TH.zStrawberry }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(TH.zonePrefix + TH.zStrawberry)).toBeInTheDocument();
    expect(within(dialog).getByText(TH.mSoil)).toBeInTheDocument();
    expect(within(dialog).getByText(TH.historyTitle)).toBeInTheDocument();
  });

  // เดิมมีเทสปุ่มรดน้ำในแผงโซน — ถอดแล้ว โรงเรือนนี้ไม่มีระบบรดน้ำ (DESIGN_SOURCE ข้อ 37)

  it('เปิดแผงควบคุมแล้วเห็นอุปกรณ์จริง 4 ตัว (พัดลมเล็กเหลือ 1)', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: TH.controlsFab }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('พัดลมใบใหญ่ #1')).toBeInTheDocument();
    expect(within(drawer).getByText('พัดลมใบใหญ่ #2')).toBeInTheDocument();
    expect(within(drawer).getByText('พัดลมตัวเล็ก #1')).toBeInTheDocument();
    expect(within(drawer).queryByText('พัดลมตัวเล็ก #2')).not.toBeInTheDocument();
    expect(within(drawer).getByText(TH.pump)).toBeInTheDocument();

    // ทุกอุปกรณ์ online แล้ว → ไม่มีตัวที่ถูกปิดเพราะออฟไลน์
    expect(within(drawer).queryByText(TH.stOffline)).not.toBeInTheDocument();
  });

  it('Emergency Stop กดครั้งเดียวติด ไม่มีหน้าต่างยืนยัน', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: TH.estopFab }));

    expect(await screen.findByText(TH.estopToast)).toBeInTheDocument();
    // ปุ่มเปลี่ยนเป็น "ปลดล็อกระบบ"
    expect(screen.getAllByRole('button', { name: TH.unlockFab }).length).toBeGreaterThan(0);
  });

  /** แดชบอร์ดทำเสร็จแล้ว เมนูต้องพาไปได้จริง ไม่ใช่ขึ้น toast "เร็วๆ นี้" */
  it('เมนู "แดชบอร์ด" พาไปหน้าแดชบอร์ดได้จริง', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <FarmStateProvider>
          <MemoryRouter initialEntries={[ROUTES.farm]}>
            <AppRoutes />
          </MemoryRouter>
        </FarmStateProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole('button', { name: TH.menuTitle }));
    await user.click(await screen.findByRole('button', { name: new RegExp(TH.navDashboard) }));

    expect(await screen.findByRole('heading', { name: TH.actTitle })).toBeInTheDocument();
    expect(screen.queryByText(TH.soonToast)).not.toBeInTheDocument();
  });

  it('ป้ายฝนโผล่เมื่อเปิดฝน และบอกว่าไม่กระทบการรดน้ำ', async () => {
    const user = userEvent.setup();
    renderScene();
    expect(screen.queryByText(TH.rainChip)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TH.menuTitle }));
    // เริ่มที่โหมด auto (ตามอากาศจริง = ไม่ตก) กดครั้งเดียว → บังคับฝนตก
    await user.click(await screen.findByRole('button', { name: TH.rainAuto }));

    expect(await screen.findByText(TH.rainChip)).toBeInTheDocument();
  });

  it('สลับภาษาแล้วข้อความเปลี่ยนเป็นอังกฤษ', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: 'TH / EN' }));

    expect(await screen.findByText(EN.hudTemp)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: EN.controlsFab })).toBeInTheDocument();
  });

  it('ตั้งค่าขั้นสูง: แท็บเงื่อนไขเป็นลิงก์ไปหน้าควบคุมโรงเรือน (ไม่ทำ builder ซ้ำในฉากเกม)', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: TH.controlsFab }));
    await user.click(await screen.findByRole('button', { name: TH.advanced }));

    const dialog = await screen.findByRole('dialog');
    // แท็บ "เงื่อนไข" เปิดมาเป็นค่าเริ่มต้น → เป็นลิงก์ ไม่ใช่ตัวตั้งค่าเงื่อนไข
    expect(
      within(dialog).getByRole('button', { name: new RegExp(TH.goToGhConditions) }),
    ).toBeInTheDocument();
    // ไม่มีช่องกรอกตัวเลขเงื่อนไขในฉากเกมแล้ว (single source อยู่หน้าโรงเรือน)
    expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('ตั้งค่าขั้นสูง: แท็บ control log แสดงประวัติการสั่งงาน', async () => {
    const user = userEvent.setup();
    renderScene();
    await user.click(screen.getByRole('button', { name: TH.controlsFab }));
    await user.click(await screen.findByRole('button', { name: TH.advanced }));
    await user.click(await screen.findByRole('button', { name: TH.tabLog }));

    expect(await screen.findByText(TH.log1)).toBeInTheDocument();
    expect(screen.getByText(TH.log4)).toBeInTheDocument();
  });

  it('ทุกปุ่มที่กดได้ต้องมี accessible name — ไม่มีปุ่มเปล่า', () => {
    renderScene();
    for (const btn of screen.getAllByRole('button')) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent ?? '';
      expect(name.trim().length, `พบปุ่มไม่มีชื่อ: ${btn.outerHTML.slice(0, 120)}`).toBeGreaterThan(
        0,
      );
    }
  });
});
