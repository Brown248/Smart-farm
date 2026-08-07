import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES } from '@/routePaths';
import { AppRoutes } from '@/routes';

/**
 * เทสชุดนี้คือหัวใจของการรวมสถานะ — พิสูจน์ว่า **4 หน้าคุยกันจริง**
 *
 * ก่อนหน้านี้แต่ละหน้าเก็บของตัวเอง อาการที่เกิดขึ้นจริง:
 * ปั๊มเปิดที่ฉากเกมแต่ปิดที่หน้าโรงเรือน · กด Emergency Stop ที่ชลประทานแล้วโรงเรือนไม่รู้เรื่อง ·
 * อุณหภูมิเป็นคนละค่า 3 ค่า ทำให้กฎความปลอดภัยตัดสินไม่เหมือนกันตามหน้าที่เปิดอยู่
 */
function renderAppAt(path: string) {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <RailStateProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </RailStateProvider>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

/** ไปหน้าอื่นผ่านเมนูจริง (ไม่ใช่ remount) เพื่อให้พิสูจน์ว่า state อยู่รอดข้ามหน้า */
async function goVia(user: ReturnType<typeof userEvent.setup>, label: string) {
  const nav = screen.getByRole('navigation');
  await user.click(within(nav).getByRole('button', { name: new RegExp(label) }));
}

/*
 * ทุกเทสในไฟล์นี้ render ทั้งแอปแล้วเดินข้ามหน้าจริงผ่านเมนู บางตัวรอ latency คำสั่ง 1.7 วิด้วย
 * รันเดี่ยวใช้ ~4 วิ แต่ตอนรันขนานกับอีก 27 ไฟล์เคยชนเพดาน 5 วิของ vitest เป็นครั้งคราว
 * ตั้งเพดานให้ทั้งชุดทีเดียว จะได้ไม่ต้องไล่แปะทีละเทสเวลาเครื่องช้า
 */
describe('สถานะเชื่อมกันข้ามหน้า', { timeout: 30000 }, () => {
  it('อุปกรณ์ 4 ตัวมีสถานะชุดเดียว — ฉากเกมกับโรงเรือนตรงกันตั้งแต่เปิดมา', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.greenhouse);

    // หน้าโรงเรือน: ปั๊มปิดอยู่ (ยังไม่ได้สั่งรดน้ำ) · พัดลมใบใหญ่ #1 เปิดอยู่ (จาก INITIAL_DEVICES)
    expect(screen.getByRole('switch', { name: `${TH.pump} — ${TH.stateOff}` })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: `พัดลมใบใหญ่ #1 — ${TH.stateOn}` }),
    ).toBeInTheDocument();

    // ไปฉากเกมแล้วเปิดแผงควบคุม — ต้องเห็นอุปกรณ์ชุดเดียวกัน (4 ตัว)
    await goVia(user, TH.navFarmGame);
    await screen.findByAltText(TH.agentName);
    await user.click(screen.getByRole('button', { name: TH.controlsFab }));

    const dock = await screen.findByRole('dialog');
    expect(within(dock).getByText('พัดลมใบใหญ่ #1')).toBeInTheDocument();
    expect(within(dock).getByText('พัดลมตัวเล็ก #1')).toBeInTheDocument();
    expect(within(dock).getByText(TH.pump)).toBeInTheDocument();
  });

  it('สั่งเปิดอุปกรณ์ที่หน้าโรงเรือน แล้วฉากเกมเห็นว่าเปิดจริง', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.greenhouse);

    // พัดลมใบใหญ่ #2 ปิดอยู่ → เปิดต้องยืนยันก่อน แล้วรออุปกรณ์ตอบ
    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: TH.confirmYes }),
    );

    expect(
      await screen.findByRole(
        'switch',
        { name: `พัดลมใบใหญ่ #2 — ${TH.stateOn}` },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();

    // ข้ามไปฉากเกม — สถานะต้องติดตามไปด้วย
    await goVia(user, TH.navFarmGame);
    await screen.findByAltText(TH.agentName);
    await user.click(screen.getByRole('button', { name: TH.controlsFab }));

    const dock = await screen.findByRole('dialog');
    // ทั้งสองใบใหญ่เปิดแล้ว → ต้องไม่มีตัวไหนแสดงว่าปิดอยู่
    expect(within(dock).getAllByText(TH.stOn).length).toBeGreaterThanOrEqual(2);
  });

  it('กด Emergency Stop ที่ฉากเกม แล้วหน้าโรงเรือนถูกล็อกตาม', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.farm);

    await user.click(screen.getByRole('button', { name: TH.estopFab }));
    expect(await screen.findByText(TH.estopToast)).toBeInTheDocument();

    // เปิดเมนูฉากเกมแล้วไปหน้าโรงเรือน
    await user.click(screen.getByRole('button', { name: TH.menuTitle }));
    await user.click(await screen.findByRole('button', { name: new RegExp(TH.navGreenhouse) }));
    await screen.findByRole('heading', { name: TH.ghTitle });

    // ต้องขึ้นสถานะหยุดฉุกเฉิน และสวิตช์ทุกตัวกดไม่ได้
    expect(screen.getByText(TH.guardEmerg)).toBeInTheDocument();
    for (const sw of screen.getAllByRole('switch')) expect(sw).toBeDisabled();
  });

  /** หยุดฉุกเฉินอยู่ในแถบเมนู จึงกดจากหน้าไหนก็ปุ่มเดียวกัน และล็อกทั้งระบบเหมือนกัน */
  it('กด Emergency Stop จากแถบเมนู แล้วทุกหน้าถูกล็อกตาม', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.irrigation);

    await user.click(screen.getByRole('button', { name: TH.estopFab }));

    await goVia(user, TH.navGreenhouse);
    await screen.findByRole('heading', { name: TH.ghTitle });
    expect(screen.getByText(TH.guardEmerg)).toBeInTheDocument();
    // ปุ่มเดิมในแถบเมนูเปลี่ยนเป็น "ปลดล็อก" ไม่ได้มีปุ่มที่สองงอกมา
    expect(screen.getAllByRole('button', { name: TH.unlockFab })).toHaveLength(1);

    // แดชบอร์ดก็เห็นสถานะเดียวกัน (แถบเมนูตัวเดียวกันทั้งสามหน้า)
    await goVia(user, TH.navDashboard);
    await screen.findByRole('heading', { name: TH.pageTitle });
    expect(screen.getByRole('button', { name: TH.unlockFab })).toBeInTheDocument();
  });

  /**
   * control log เคยมีสองชุด — หน้าโรงเรือนเก็บของตัวเอง ลิ้นชักชลประทานอ่านของส่วนกลาง
   * สั่งงานที่หน้าหนึ่งแล้วอีกหน้าไม่รู้เรื่อง ทั้งที่หัวข้อใช้คีย์ `ctrlLogTitle` เดียวกัน
   */
  it('สั่งงานที่หน้าโรงเรือน แล้วประวัติในลิ้นชักหน้าชลประทานเห็นด้วย', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.greenhouse);

    // หน้าโรงเรือนไม่มีส่วน "ประวัติการสั่งงาน" แล้ว — log กลางยังถูกเขียนและไปเห็นที่ลิ้นชักชลประทาน
    await user.click(screen.getByRole('button', { name: TH.estopFab }));

    await goVia(user, TH.navIrrigation);
    const bedA = screen
      .getAllByRole('button', { name: new RegExp(`^${TH.zoneLetterPrefix}A · `) })
      .find((b) => !(b.getAttribute('aria-label') ?? '').endsWith(TH.mapSensor));
    await user.click(bedA!);
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}A` });
    await user.click(within(drawer).getByRole('tab', { name: TH.tabHistory }));

    expect(within(drawer).getByText(TH.logEstop)).toBeInTheDocument();
  });

  /**
   * ไม่มีวาล์วแยกแปลง — "รดน้ำ" คือเปิดปั๊มตัวเดียวของฟาร์ม ทั้ง 8 แปลงจึงโดนน้ำพร้อมกัน
   * เทสนี้คุมว่าหน้าชลประทานกับฉากเกมอ่านสถานะเดียวกันจริง
   */
  it('สั่งรดน้ำที่หน้าชลประทาน แล้วฉากเกมเห็นว่าทั้งโรงเรือนกำลังรดอยู่', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.irrigation);

    await user.click(screen.getByRole('button', { name: new RegExp(TH.ctStart) }));
    await user.click(
      within(await screen.findByRole('dialog', { name: TH.waterTitle })).getByRole('button', {
        name: TH.confirmYes,
      }),
    );

    // รออุปกรณ์ยืนยัน แล้วปุ่มต้องเปลี่ยนเป็น "หยุดรดน้ำ"
    expect(
      await screen.findByRole('button', { name: new RegExp(TH.ctStop) }, { timeout: 10000 }),
    ).toBeInTheDocument();

    // ข้ามไปฉากเกม — แปลงที่ไม่ได้ถูกสั่งโดยตรงก็ต้องขึ้นว่ากำลังรดน้ำเหมือนกัน
    await goVia(user, TH.navFarmGame);
    await screen.findByAltText(TH.agentName);
    await user.click(screen.getByRole('button', { name: TH.zonePrefix + TH.zTomato }));

    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByRole('button', { name: TH.stopWaterBtn })).toBeInTheDocument();
  });

  /** ระบบน้ำ (ถัง/แรงดัน/ปริมาณ) ถอดออกแล้วทั้งสองหน้า — เป็นค่าจำลองล้วน (เจ้าของงานสั่ง) */
  it('ไม่มีส่วนระบบน้ำทั้งหน้าโรงเรือนและหน้าชลประทาน', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.greenhouse);
    expect(screen.queryByRole('region', { name: TH.infraTitle })).not.toBeInTheDocument();

    await goVia(user, TH.navIrrigation);
    await screen.findByRole('heading', { name: TH.irrTitle });
    expect(screen.queryByRole('region', { name: TH.infraTitle })).not.toBeInTheDocument();
  });

  it('อุณหภูมิที่ทุกหน้าเห็นเป็นค่าเดียวกัน (กฎ G2 จึงตัดสินเหมือนกัน)', async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.greenhouse);

    // หน้าโรงเรือนอ่านค่าจากส่วนกลาง → ค่าเริ่มต้น 33.4°C ไม่ใช่ 29°C แบบเดิม
    const ghTemp = screen.getByText('33.4');
    expect(ghTemp).toBeInTheDocument();

    await goVia(user, TH.navDashboard);
    await screen.findByRole('heading', { name: TH.pageTitle });
    // การ์ดเซนเซอร์ของแดชบอร์ดใช้ค่าเดียวกัน (ปัดเป็นจำนวนเต็ม)
    expect(await screen.findByText('33', undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  /** เดินไปกลับสองหน้าและรอการ์ดเซนเซอร์โหลดสองรอบ ใช้เวลานานกว่าเทสอื่น */
  it('ตั้งเกณฑ์ที่แดชบอร์ดแล้วค่าอยู่รอดตอนกลับมาใหม่', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    renderAppAt(ROUTES.dashboard);
    await screen.findByText(TH.senSoil, undefined, { timeout: 3000 });

    // ดิน 24% ต่ำกว่าเกณฑ์เตือน 30% → ขึ้นป้าย "ต่ำกว่าเกณฑ์"
    // เจาะเฉพาะการ์ดดิน — การ์ดอุณหภูมิก็เตือนได้เองถ้าร้อนเกินช่วง (INITIAL_CLIMATE 33.4°C)
    const soil = () => within(screen.getByRole('group', { name: TH.senSoil }));
    expect(soil().getByText(TH.stWatch)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `${TH.setThreshold} — ${TH.senSoil}` }));
    const dialog = await screen.findByRole('dialog', { name: TH.thresholdTitle });
    const warn = within(dialog).getByLabelText(TH.warnBelow);
    await user.clear(warn);
    await user.type(warn, '10');
    await user.click(within(dialog).getByRole('button', { name: TH.save }));
    expect(soil().queryByText(TH.stWatch)).not.toBeInTheDocument();

    // ออกไปหน้าอื่นแล้วกลับมา — เกณฑ์ที่ตั้งไว้ต้องยังอยู่ ไม่รีเซ็ต
    await goVia(user, TH.navGreenhouse);
    await screen.findByRole('heading', { name: TH.ghTitle });
    await goVia(user, TH.navDashboard);
    await screen.findByText(TH.senSoil, undefined, { timeout: 3000 });

    expect(soil().queryByText(TH.stWatch)).not.toBeInTheDocument();
  });
});
