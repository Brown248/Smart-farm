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
import { DASH_ZONES } from '@/data/dashboard';
import { DashboardPage } from './DashboardPage';

function renderPage() {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <MemoryRouter initialEntries={[ROUTES.dashboard]}>
          <DashboardPage />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

/** การ์ดเซนเซอร์โผล่หลังโครงกระดูกหายไป (จำลองการโหลด 700ms) */
const waitForSensors = () => screen.findByText(TH.senSoil, undefined, { timeout: 3000 });

describe('DashboardPage', () => {
  it('มีส่วนหลักของหน้าครบตามสเปกเฟส 2', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: TH.pageTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.actTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.zonesTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.realtimeTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.chartTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.quickTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.dailyTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TH.logTitle })).toBeInTheDocument();
    await waitForSensors();
  });

  /**
   * ลำดับที่เจ้าของงานสั่ง (ต้นแบบเรียงต่างจากนี้) — ล็อกไว้กันสลับกลับโดยไม่ตั้งใจ
   * ภาพรวมทั้งฟาร์ม → ค่าเซนเซอร์เรียลไทม์ → สถานะทุกโซน → สิ่งที่ควรทำตอนนี้
   */
  it('เรียง: ภาพรวมทั้งฟาร์ม → ค่าเซนเซอร์ → สถานะทุกโซน → สิ่งที่ควรทำตอนนี้', () => {
    renderPage();
    const order = [TH.heroBadge, TH.realtimeTitle, TH.zonesTitle, TH.actTitle].map((name) =>
      screen.getByRole('region', { name }),
    );

    for (let i = 0; i < order.length - 1; i++) {
      const [before, after] = [order[i]!, order[i + 1]!];
      // DOCUMENT_POSITION_FOLLOWING → `after` อยู่ถัดจาก `before` ในเอกสาร
      expect(
        before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
        `"${after.getAttribute('aria-label')}" ต้องอยู่ใต้ "${before.getAttribute('aria-label')}"`,
      ).toBeTruthy();
    }
  });

  /** แถบความชื้นต้องยาวตรงกับตัวเลขบนการ์ด ไม่งั้นกวาดตาเทียบโซนแล้วได้ภาพผิด */
  it('การ์ดโซนทั้ง 8 ใบมีแถบความชื้นยาวตรงกับค่าจริง', () => {
    renderPage();
    const zones = screen.getByRole('region', { name: TH.zonesTitle });
    const cards = within(zones).getAllByRole('button');

    expect(cards).toHaveLength(DASH_ZONES.length);
    for (const [i, card] of cards.entries()) {
      const z = DASH_ZONES[i]!;
      expect(card.style.getPropertyValue('--zone-fill'), `โซน ${z.letter}`).toBe(`${z.moisture}%`);
    }
  });

  it('Recommended Actions อิงค่าจริง มีเลขลำดับ + เหตุผล', () => {
    renderPage();
    // โหมดจำลอง (ไม่ต่อจริง): ไม่มีค่าเซนเซอร์จริง → มีแต่รายการ "ตรวจเซนเซอร์ดิน" (sensor-g)
    const region = within(screen.getByRole('region', { name: TH.actTitle }));
    const items = region.getAllByRole('listitem');
    expect(within(items[0]!).getByText(TH.act2)).toBeInTheDocument();
    expect(within(items[0]!).getByText(TH.act2why)).toBeInTheDocument();
    expect(within(items[0]!).getByText('1')).toBeInTheDocument();
  });

  /** เลิก card mock/hardcode แล้ว — "สิ่งที่ควรทำ" มาจากค่าจริงล้วน ไม่มีเล็มหญ้า/เก็บเกี่ยว/ใส่ปุ๋ยตายตัว */
  it('สิ่งที่ควรทำตอนนี้ไม่มีการ์ด mock เดิม (เล็มหญ้า/เก็บเกี่ยว)', () => {
    renderPage();
    const region = within(screen.getByRole('region', { name: TH.actTitle }));
    expect(region.queryByText(TH.act4)).not.toBeInTheDocument();
    expect(region.queryByText(TH.act5)).not.toBeInTheDocument();
  });

  it('แสดงสถานะครบ 8 โซนพร้อมชนิดพืช', () => {
    renderPage();
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(screen.getByText(TH.zoneLetterPrefix + letter)).toBeInTheDocument();
    }
    expect(screen.getByText(TH.crop_flowers)).toBeInTheDocument();
    expect(screen.getByText(TH.crop_strawberry)).toBeInTheDocument();
  });

  it('การ์ดเซนเซอร์ 4 ใบ ทุกใบมีบรรทัด "ต้องทำอะไร"', async () => {
    renderPage();
    await waitForSensors();
    expect(screen.getByText(TH.advTemp)).toBeInTheDocument();
    expect(screen.getByText(TH.advSoil)).toBeInTheDocument();
    expect(screen.getByText(TH.advLight)).toBeInTheDocument();
    expect(screen.getByText(TH.advHum)).toBeInTheDocument();
  });

  /** รอการ์ดเซนเซอร์โหลดสองรอบ (700ms × 2) ช้ากว่าเทสอื่นเป็นปกติ */
  it('เซนเซอร์ค่าค้างมีป้ายเตือนและปุ่มลองอ่านใหม่ที่กดได้', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForSensors();
    expect(screen.getByText(TH.stale)).toBeInTheDocument();
    expect(screen.getByText(TH.errReading)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TH.retry }));
    // กลับไปสถานะกำลังโหลดก่อน แล้วค่อยกลับมา
    expect(screen.queryByText(TH.senSoil)).not.toBeInTheDocument();
    await waitForSensors();
  });

  it('Threshold Modal มี input จริง และค่าที่บันทึกเปลี่ยนสถานะการ์ดจริง', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForSensors();

    // ตอนเริ่ม ดิน 24% ต่ำกว่าเกณฑ์เตือน 30% → ป้าย "ต่ำกว่าเกณฑ์" (จำกัดที่การ์ดดิน —
    // ตอนนี้การ์ดอุณหภูมิก็เตือนได้ถ้าร้อนเกินช่วง จึงต้องเจาะเฉพาะการ์ดดิน)
    const soilCard = () => within(screen.getByRole('group', { name: TH.senSoil }));
    expect(soilCard().getByText(TH.stWatch)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `${TH.setThreshold} — ${TH.senSoil}` }));
    const dialog = await screen.findByRole('dialog', { name: TH.thresholdTitle });
    const warn = within(dialog).getByLabelText(TH.warnBelow);
    expect(warn).toHaveValue(30);

    // ลดเกณฑ์เตือนลงต่ำกว่าค่าจริง → การ์ดดินต้องกลับเป็นปกติ
    await user.clear(warn);
    await user.type(warn, '10');
    await user.click(within(dialog).getByRole('button', { name: TH.save }));

    expect(screen.queryByRole('dialog', { name: TH.thresholdTitle })).not.toBeInTheDocument();
    expect(soilCard().queryByText(TH.stWatch)).not.toBeInTheDocument();
  });

  it('ปุ่มยกเลิกของ Threshold Modal ไม่บันทึกค่า', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForSensors();

    await user.click(screen.getByRole('button', { name: `${TH.setThreshold} — ${TH.senSoil}` }));
    const dialog = await screen.findByRole('dialog', { name: TH.thresholdTitle });
    await user.clear(within(dialog).getByLabelText(TH.warnBelow));
    await user.type(within(dialog).getByLabelText(TH.warnBelow), '10');
    await user.click(within(dialog).getByRole('button', { name: TH.cancel }));

    // ยังเตือนอยู่เหมือนเดิม (เจาะเฉพาะการ์ดดิน)
    expect(
      within(screen.getByRole('group', { name: TH.senSoil })).getByText(TH.stWatch),
    ).toBeInTheDocument();
  });

  it('แบนเนอร์เตือนเปิดหน้าต่างสุขภาพเซนเซอร์ และกดรับทราบแล้วแบนเนอร์หาย', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText(TH.bannerTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TH.details }));
    const dialog = await screen.findByRole('dialog', { name: TH.healthTitle });
    expect(within(dialog).getByText(TH.healthCardTitle)).toBeInTheDocument();
    expect(within(dialog).getByText(TH.hs1)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: TH.acknowledge }));
    expect(screen.queryByText(TH.bannerTitle)).not.toBeInTheDocument();
  });

  it('กราฟ: สลับจากทุกค่ารวมไปดูทีละค่าได้ และเปลี่ยนช่วงเวลาได้', async () => {
    const user = userEvent.setup();
    renderPage();

    const chart = screen.getByRole('region', { name: TH.chartTitle });
    expect(within(chart).getByText(TH.historySubAll)).toBeInTheDocument();

    await user.click(within(chart).getByRole('tab', { name: TH.mTemp }));
    expect(within(chart).getByText(TH.historySub)).toBeInTheDocument();
    // ค่าล่าสุดตัวใหญ่ = จุดสุดท้ายของเส้นจริง (mock ช่วง "day") ไม่ใช่เลขคงที่เดิม "31°C"
    expect(within(chart).getByText('29°C')).toBeInTheDocument();

    await user.click(within(chart).getByRole('button', { name: `${TH.chartTitle} — ${TH.rWeek}` }));
    expect(
      within(chart).getByRole('button', { name: `${TH.chartTitle} — ${TH.rWeek}` }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('กราฟ: เปิดโหมดเทียบช่วง แสดง empty state (ไม่มีตัวเลขส่วนต่างปลอม)', async () => {
    const user = userEvent.setup();
    renderPage();
    const chart = screen.getByRole('region', { name: TH.chartTitle });
    await user.click(within(chart).getByRole('button', { name: new RegExp(TH.compare) }));
    // เดิมโชว์ −12%/+2°C ที่ฝังไว้ปลอม → ตอนนี้เป็น empty state จนกว่าจะมีข้อมูลจริง
    expect(within(chart).getByText(TH.cmpNoData)).toBeInTheDocument();
  });

  it('ปุ่มดาวน์โหลดสร้างไฟล์ CSV จริง', async () => {
    const user = userEvent.setup();
    const createUrl = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeUrl, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderPage();
    const chart = screen.getByRole('region', { name: TH.chartTitle });
    await user.click(within(chart).getByRole('button', { name: new RegExp(TH.download) }));

    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = createUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toContain('text/csv');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('บันทึกเร็วเพิ่มรายการเข้าไทม์ไลน์จริง', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: TH.quickAdd }));
    const dialog = await screen.findByRole('dialog', { name: TH.quickAdd });
    await user.click(within(dialog).getByRole('button', { name: TH.catHarvest }));
    await user.type(within(dialog).getByLabelText(TH.quickAddPlaceholder), 'เก็บผักสลัดโซน E');
    await user.click(within(dialog).getByRole('button', { name: TH.save }));

    expect(screen.getByText('เก็บผักสลัดโซน E')).toBeInTheDocument();
    expect(screen.getByText(TH.qaJustNow)).toBeInTheDocument();
  });

  it('บันทึกเร็วโดยไม่พิมพ์อะไร ใช้ข้อความเริ่มต้นของหมวดนั้น', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: TH.quickAdd }));
    const dialog = await screen.findByRole('dialog', { name: TH.quickAdd });
    await user.click(within(dialog).getByRole('button', { name: TH.save }));

    expect(screen.getByText(TH.qaDefault_water)).toBeInTheDocument();
  });

  it('แชท AI ตอบคำถามลัดได้', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: TH.askAI }));
    const chat = await screen.findByRole('dialog', { name: TH.chatTitle });
    expect(within(chat).getByText(TH.chatGreeting)).toBeInTheDocument();

    await user.click(within(chat).getByRole('button', { name: TH.chip2 }));
    expect(
      await within(chat).findByText(TH.chatA2, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('การแจ้งเตือนเปิดดูได้', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: TH.notifTitle }));
    const panel = await screen.findByRole('dialog', { name: TH.notifTitle });
    expect(within(panel).getByText(TH.n1)).toBeInTheDocument();
    expect(within(panel).getByText(TH.n2)).toBeInTheDocument();
  });

  function renderApp(at: string = ROUTES.dashboard) {
    return render(
      <I18nProvider>
        <FarmStateProvider>
          <MemoryRouter initialEntries={[at]}>
            <AppRoutes />
          </MemoryRouter>
        </FarmStateProvider>
      </I18nProvider>,
    );
  }

  it('ทางลัดชลประทานพาไปหน้าชลประทานจริง', async () => {
    const user = userEvent.setup();
    renderApp();
    const quick = screen.getByRole('group', { name: TH.quickTitle });
    await user.click(within(quick).getByRole('button', { name: new RegExp(TH.irrigationTitle) }));

    expect(await screen.findByRole('heading', { name: TH.irrTitle })).toBeInTheDocument();
  });

  it('ทางลัดโรงเรือนพาไปหน้าควบคุมโรงเรือนจริง', async () => {
    const user = userEvent.setup();
    renderApp();
    const quick = screen.getByRole('group', { name: TH.quickTitle });
    await user.click(within(quick).getByRole('button', { name: new RegExp(TH.climateTitle) }));

    expect(await screen.findByRole('heading', { name: TH.ghTitle })).toBeInTheDocument();
  });

  /** การ์ดโซนกับ "สิ่งที่ควรทำตอนนี้" ต้องพาไปที่เดียวกัน คือหน้าชลประทาน */
  it('การ์ดใน "สิ่งที่ควรทำตอนนี้" พาไปหน้าชลประทาน', async () => {
    const user = userEvent.setup();
    renderApp();
    const actions = screen.getByRole('region', { name: TH.actTitle });
    await user.click(within(actions).getAllByRole('button')[0]!);

    expect(await screen.findByRole('heading', { name: TH.irrTitle })).toBeInTheDocument();
  });

  it('เมนูรายงาน/ตั้งค่าที่ยังไม่ได้ทำ แจ้ง "เร็วๆ นี้" แทนการพาไปหน้าเปล่า', async () => {
    const user = userEvent.setup();
    renderPage();
    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getByRole('button', { name: new RegExp(TH.navReports) }));
    expect(await screen.findByText(TH.soonToast)).toBeInTheDocument();
  });

  it('สลับภาษาเป็นอังกฤษได้ทั้งหน้า', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: EN.pageTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: EN.actTitle })).toBeInTheDocument();
  });

  it('สมุดบันทึก: เริ่มว่าง (ไม่ seed ข้อมูลปลอม) แสดง empty state ที่ออกแบบไว้', async () => {
    const user = userEvent.setup();
    renderPage();
    const log = screen.getByRole('region', { name: TH.logTitle });

    // เริ่มต้นไม่มีรายการเลย → empty state (แทนการ seed 4 รายการปลอมแบบเดิม)
    expect(within(log).getByText(TH.emptyLogTitle)).toBeInTheDocument();
    expect(within(log).getByText(TH.emptyLogBody)).toBeInTheDocument();

    // กรองหมวดอื่นก็ยังว่าง
    await user.click(within(log).getByRole('button', { name: TH.catHarvest }));
    expect(within(log).getByText(TH.emptyLogTitle)).toBeInTheDocument();
  });

  /**
   * เลิกทำปฏิทินแล้ว — ล็อกจำนวนรายการไว้ ถ้ามีใครเผลอเติมกลับเข้ามาจะ fail
   * (เช็กเป็นจำนวน+รายชื่อ ไม่อ้างคำว่า "ปฏิทินดูแล" เพราะลบคีย์แปลนั้นทิ้งไปแล้ว)
   */
  it('เมนูเหลือ 6 รายการ ไม่มีปฏิทินดูแล', () => {
    renderPage();
    const nav = screen.getByRole('navigation');
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent?.trim() ?? '');

    // ปุ่มพับเมนูไม่มีข้อความ จึงกรองออก · ปุ่มหยุดฉุกเฉินอยู่ในแถบนี้ด้วยแต่ไม่ใช่รายการเมนู
    const items = labels.filter(Boolean).filter((l) => l !== TH.estopFab && l !== TH.unlockFab);
    expect(items).toHaveLength(6);
    for (const name of [
      TH.navDashboard,
      TH.navIrrigation,
      TH.navGreenhouse,
      TH.navFarmGame,
      TH.navReports,
      TH.navSettings,
    ]) {
      expect(
        items.some((l) => l.includes(name)),
        `เมนูขาด "${name}"`,
      ).toBe(true);
    }
  });

  it('ทางลัดเหลือ 2 ใบ (ชลประทาน · โรงเรือน) ไม่มีปฏิทิน', () => {
    renderPage();
    const quick = screen.getByRole('group', { name: TH.quickTitle });
    const cards = within(quick).getAllByRole('button');

    expect(cards).toHaveLength(2);
    expect(within(quick).getByText(TH.irrigationTitle)).toBeInTheDocument();
    expect(within(quick).getByText(TH.climateTitle)).toBeInTheDocument();
  });

  /** เมนูข้างซ้ายต้องพากลับฉากเกมได้ ไม่งั้นเข้าแดชบอร์ดแล้วออกไม่ได้ */
  it('เมนู "ฟาร์มเกม" พากลับไปฉากฟาร์มได้จริง', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <FarmStateProvider>
          <MemoryRouter initialEntries={[ROUTES.dashboard]}>
            <AppRoutes />
          </MemoryRouter>
        </FarmStateProvider>
      </I18nProvider>,
    );
    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getByRole('button', { name: new RegExp(TH.navFarmGame) }));

    expect(await screen.findByAltText(TH.agentName)).toBeInTheDocument();
  });

  /** เหลือแค่ 2 หน้าที่ยังไม่มีต้นแบบ — ต้องแจ้งตรงๆ ไม่ใช่พาไปหน้าเปล่า */
  it('เมนูรายงาน/ตั้งค่า ที่ยังไม่ได้ทำ แจ้ง "เร็วๆ นี้"', async () => {
    const user = userEvent.setup();
    renderPage();
    const nav = screen.getByRole('navigation');

    for (const label of [TH.navReports, TH.navSettings]) {
      await user.click(within(nav).getByRole('button', { name: new RegExp(label) }));
      expect(await screen.findByText(TH.soonToast)).toBeInTheDocument();
    }
  });

  it('เมนูชลประทาน/โรงเรือน พาไปหน้าจริงแล้ว', async () => {
    const user = userEvent.setup();
    renderApp();
    const nav = screen.getByRole('navigation');

    await user.click(within(nav).getByRole('button', { name: new RegExp(TH.navIrrigation) }));
    expect(await screen.findByRole('heading', { name: TH.irrTitle })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: new RegExp(TH.navGreenhouse),
      }),
    );
    expect(await screen.findByRole('heading', { name: TH.ghTitle })).toBeInTheDocument();
  });

  it('ไม่แตะ localStorage/sessionStorage เลย (กฎเหล็กข้อ 7)', async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    renderPage();
    await user.click(screen.getByRole('button', { name: TH.toggleMenu }));
    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ทุกปุ่มที่กดได้ต้องมีชื่อ — ไม่มีปุ่มเปล่า', async () => {
    renderPage();
    await waitForSensors();
    for (const btn of screen.getAllByRole('button')) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent ?? '';
      expect(name.trim().length, `พบปุ่มไม่มีชื่อ: ${btn.outerHTML.slice(0, 120)}`).toBeGreaterThan(
        0,
      );
    }
  });
});
