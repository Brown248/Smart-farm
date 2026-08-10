import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { INITIAL_DEVICES } from '@/data/devices';
import { TH } from '@/i18n/th';
import { EN } from '@/i18n/en';
import { ROUTES } from '@/routePaths';
import { GreenhousePage } from './GreenhousePage';

function renderPage() {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <MemoryRouter initialEntries={[ROUTES.greenhouse]}>
          <GreenhousePage />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

/** แปลง record ของ string → attributes (ค่าจริงมาเป็น string ทุกตัว) */
const mkAttrs = (rec: Record<string, string>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { value: v, timestamp: 1 }]));

/** โหมดควบคุมจริง + ฉีด attributes จริง (สำหรับตรวจ smoke-test ข้อ 1.4) */
function renderLive(attrs: Record<string, string>) {
  return render(
    <I18nProvider>
      <FarmStateProvider forceRealControl forceAttributes={mkAttrs(attrs)}>
        <MemoryRouter initialEntries={[ROUTES.greenhouse]}>
          <GreenhousePage />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

const BIG1 = 'พัดลมใบใหญ่ #1';
const SML1 = 'พัดลมตัวเล็ก #1';

/**
 * attribute ไหลเข้ามาสะสมทีละก้อน — `led0` มาถึงก่อน `min_temp0`/`max_temp0` ได้
 *
 * ของเดิมใช้ `led` อย่างเดียวเป็นสัญญาณว่า "ข้อมูลพร้อม" แล้วล็อกไม่เติมซ้ำอีกเลย
 * → ฟอร์มค้างที่ค่า default ปลอม และถ้าผู้ใช้กดบันทึกต่อ = เขียนเกณฑ์ผิดลงอุปกรณ์จริง
 */
describe('GreenhousePage — เติมเกณฑ์จากอุปกรณ์จริง (กันค่า default ปลอมล็อกถาวร)', () => {
  const minLabel = `${BIG1} · ${TH.ghTempMinLabel}`;
  const maxLabel = `${BIG1} · ${TH.ghTempMaxLabel}`;

  const live = (attrs: Record<string, string>) => (
    <I18nProvider>
      <FarmStateProvider forceRealControl forceAttributes={mkAttrs(attrs)}>
        <MemoryRouter initialEntries={[ROUTES.greenhouse]}>
          <GreenhousePage />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>
  );

  it('led มาก่อนเกณฑ์ → พอเกณฑ์จริงมาถึงต้องเติมด้วยค่าจริง (ไม่ค้างที่ค่าปลอม)', () => {
    // รอบแรก: มีแต่ led0 — ยังไม่รู้เกณฑ์จริง ช่องกรอกยังไม่โผล่ (โหมดจริงเชื่อค่าอุปกรณ์เท่านั้น)
    const { rerender } = render(live({ led0: 'false' }));
    expect(screen.queryByLabelText(minLabel)).not.toBeInTheDocument();

    // รอบสอง: เกณฑ์จริงมาถึง → ต้องเติมตามอุปกรณ์ แม้จะเคย render ไปแล้วรอบหนึ่ง
    // ของเดิมล็อกไว้ตั้งแต่รอบแรกแล้วเติมเป็น 30/35 (ค่า default ปลอม) — เทสนี้จะจับได้
    rerender(live({ led0: 'false', min_temp0: '28', max_temp0: '33' }));
    expect(screen.getByLabelText(minLabel)).toHaveValue(28);
    expect(screen.getByLabelText(maxLabel)).toHaveValue(33);
  });

  it('ผู้ใช้แก้ฟอร์มแล้ว ค่าจากอุปกรณ์ต้องไม่ทับสิ่งที่กำลังแก้', async () => {
    const user = userEvent.setup();
    const { rerender } = render(live({ led0: 'false', min_temp0: '28', max_temp0: '33' }));

    const min = screen.getByLabelText(minLabel);
    await user.clear(min);
    await user.type(min, '26');
    expect(min).toHaveValue(26);

    // อุปกรณ์รายงานค่าใหม่ระหว่างที่ผู้ใช้กำลังแก้ → ห้ามกระชากค่าในช่องไป
    rerender(live({ led0: 'false', min_temp0: '22', max_temp0: '33' }));
    expect(screen.getByLabelText(minLabel)).toHaveValue(26);
  });
});

describe('GreenhousePage', () => {
  /** ระบบน้ำถอดออกจากทั้งระบบแล้ว — เป็นค่าจำลองล้วน (`DESIGN_SOURCE.md` ข้อ 28) */
  it('ไม่มีระบบน้ำในหน้านี้แล้ว', () => {
    renderPage();
    expect(screen.queryByRole('region', { name: TH.infraTitle })).not.toBeInTheDocument();
    expect(screen.queryByText(TH.tankRemain)).not.toBeInTheDocument();
  });

  // ── โหมดควบคุมจริง (HandySense) · smoke-test ข้อ 1.4 + ปั๊ม disable ──
  it('โหมดจริง: ช่องที่มี automation โชว์ป้าย "อาจถูกทับ" · ปั๊มคุมได้ · พัดลมเล็กพ่วงใหญ่#2 disable', () => {
    // ch0 (big1) ตั้งเกณฑ์อุณหภูมิ 30/35 → mode auto · ch1/ch2 ไม่มีเกณฑ์ → no-auto
    renderLive({
      led0: 'false',
      min_temp0: '30',
      max_temp0: '35',
      min_soil0: '0',
      max_soil0: '0',
    });

    // 1.4: ช่องที่มี automation เห็นป้ายเตือน (โผล่ครั้งเดียว = เฉพาะ big1)
    expect(screen.getByText(TH.hsAutoOverride)).toBeInTheDocument();

    // ปั๊มต่อ relay จริงแล้ว (ch2) → สวิตช์กดได้ (ไม่ disable)
    const pumpSwitch = screen.getByRole('switch', { name: `${TH.pump} — ${TH.stateOff}` });
    expect(pumpSwitch).not.toBeDisabled();

    // พัดลมเล็กพ่วงกับใหญ่ #2 → มีป้ายบอก + สวิตช์ถูก disable (คุมแยกไม่ได้)
    expect(screen.getByText(TH.ghBondedFollows(`${TH.bigFan} #2`))).toBeInTheDocument();
    const smlSwitch = screen.getByRole('switch', {
      name: `${TH.smallFan} #1 — ${TH.stateOff}`,
    });
    expect(smlSwitch).toBeDisabled();
  });

  // ── อุปกรณ์ถูกระงับ (netpie_banned) → กันปุ่มทุกตัว (กดตอนอุปกรณ์ดับ ระบบตอบ ok:true หลอกว่าสำเร็จ) ──
  it('โหมดจริง: netpie_banned=true → สวิตช์ทุกตัวถูก disable (รวมปั๊มที่ปกติกดได้)', () => {
    renderLive({ netpie_banned: 'true', led1: 'true' });
    // พัดลมใหญ่ #2 (led1=true → เปิดอยู่) ต้องถูกปิดปุ่ม
    expect(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOn}` })).toBeDisabled();
    // ปั๊ม (ปกติโหมดจริงกดได้) ก็ต้องถูกปิดปุ่มเมื่อถูกระงับ
    expect(screen.getByRole('switch', { name: `${TH.pump} — ${TH.stateOff}` })).toBeDisabled();
  });

  // ── ปิดออโต้ = สั่งดับพัดลมด้วย · ผ่านห่วงโซ่ disableTempAuto (มี G2) ไม่ใช่ sendThreshold เปล่าๆ ──
  it('โหมดจริง: ปิดออโต้ใบใหญ่ตัวสุดท้ายตอนร้อน (33.4°C) → เด้ง G2 เตือน (พิสูจน์ว่าต่อ disableTempAuto)', async () => {
    const user = userEvent.setup();
    // big1 ปิด (led0=false) · big2 ตั้งเกณฑ์ auto → ปิดออโต้ big2 = ปิดพัดลมใหญ่ตัวสุดท้ายขณะร้อน
    renderLive({ led0: 'false', min_temp1: '30', max_temp1: '35' });
    await user.click(
      screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.ghTempAutoTitle}` }),
    );
    // sendThreshold เปล่าๆ จะไม่มี G2 · กล่องเตือนนี้ยืนยันว่าเดินผ่าน disableTempAuto (สั่งดับ+กัน G2)
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(TH.guardWarnTitle)).toBeInTheDocument();
  });

  it('แสดงค่าอากาศ 4 ค่า พร้อมป้ายเตือนเมื่อความชื้นสูง', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: TH.statusTitle })).toBeInTheDocument();
    // จำกัดขอบเขตที่การ์ดอากาศ — "อุณหภูมิ" ยังไปโผล่เป็นชื่อแท็บในการ์ดเงื่อนไขพัดลมด้วย
    const climate = screen.getByRole('region', { name: TH.statusTitle });
    for (const label of [TH.cTemp, TH.cHum, TH.cLight]) {
      expect(within(climate).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(TH.climateWarn)).toBeInTheDocument();
    expect(screen.getByText(TH.cHumNote)).toBeInTheDocument();
  });

  it('แสดงอุปกรณ์จริง 4 ตัว ใช้ชื่อชุดเดียวกับฉากเกม', () => {
    renderPage();
    // นับเฉพาะสวิตช์เปิด/ปิดของอุปกรณ์ (aria ลงท้ายด้วย "— สถานะ") ไม่รวมสวิตช์อัตโนมัติ/ตารางเวลาในส่วนเงื่อนไข
    const switches = screen.getAllByRole('switch', {
      name: new RegExp(`— (${TH.stateOn}|${TH.stateOff})$`),
    });
    // เจ้าของงานลดพัดลมเล็ก 2 → 1 ตัว → เหลือ 4 อุปกรณ์ (ใหญ่ 2 · เล็ก 1 · ปั๊ม 1)
    expect(switches).toHaveLength(4);
    // ชื่ออุปกรณ์โผล่ทั้งบนการ์ดและในส่วนเงื่อนไขรวม → ใช้ getAllByText
    expect(screen.getAllByText(BIG1).length).toBeGreaterThan(0);
    expect(screen.getAllByText('พัดลมใบใหญ่ #2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(SML1).length).toBeGreaterThan(0);
    expect(screen.getAllByText(TH.pump).length).toBeGreaterThan(0);
  });

  it('การเปิดอุปกรณ์ต้องยืนยันก่อน แล้วจึงรอผลตอบกลับ', async () => {
    const user = userEvent.setup();
    renderPage();

    // พัดลมใบใหญ่ #2 ปิดอยู่ → กดเปิดต้องขึ้นกล่องยืนยัน
    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }));
    const dialog = await screen.findByRole('dialog');
    // ถ้อยคำมาจากห่วงโซ่คำสั่งกลาง (ตัวเดียวกับฉากเกม) ไม่ใช่กล่องยืนยันของหน้านี้เอง
    expect(
      within(dialog).getByText(TH.confirmDevTitle(TH.actOn, 'พัดลมใบใหญ่ #2')),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(TH.confirmDevBody)).toBeInTheDocument();

    // ยกเลิกแล้วต้องไม่เปลี่ยนสถานะ
    await user.click(within(dialog).getByRole('button', { name: TH.cancel }));
    expect(
      screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }),
    ).toBeInTheDocument();
  });

  it('ยืนยันแล้วขึ้นสถานะ "ส่งคำสั่งแล้ว" ก่อนอุปกรณ์ยืนยันจริง', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: TH.confirmYes }));

    expect(screen.getByText(TH.stateSending)).toBeInTheDocument();
    // ยังไม่พลิกเป็น "ทำงานอยู่" จนกว่าอุปกรณ์จะตอบกลับ
    expect(
      screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }),
    ).toBeInTheDocument();
  });

  /**
   * เดิมหน้านี้ถามยืนยันเฉพาะตอน "เปิด" ส่วนฉากเกมถามทั้งสองทาง
   * อุปกรณ์ชุดเดียวกันแต่ขั้นตอนความปลอดภัยต่างกันตามหน้าที่เปิดอยู่ (ขัดกฎเหล็กข้อ 2)
   * พอมาใช้ห่วงโซ่กลางจึงถามทั้งสองทางเหมือนกันหมด — เลือกทางที่เข้มกว่า
   */
  it('ปิดอุปกรณ์ที่เปิดอยู่ก็ต้องยืนยันเหมือนกัน', async () => {
    const user = userEvent.setup();
    // เปิดพัดลมใหญ่ทั้ง 2 ตัว → ปิดใบ #2 ได้ (ใบ #1 ยังเหลือ ไม่ติด G2) แล้วต้องยืนยัน
    // (พัดลมเล็กพ่วงใหญ่#2 คุมแยกไม่ได้ · ปั๊มเริ่มปิด → ใช้ใบใหญ่ #2 แทน)
    const bothBigOn = INITIAL_DEVICES.map((d) => (d.id === 'big2' ? { ...d, on: true } : d));
    render(
      <I18nProvider>
        <FarmStateProvider initialDevices={bothBigOn}>
          <MemoryRouter initialEntries={[ROUTES.greenhouse]}>
            <GreenhousePage />
          </MemoryRouter>
        </FarmStateProvider>
      </I18nProvider>,
    );
    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOn}` }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(TH.confirmDevTitle(TH.actOff, 'พัดลมใบใหญ่ #2')),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: TH.confirmYes }));
    expect(screen.getByText(TH.stateSending)).toBeInTheDocument();
  });

  /**
   * กฎ G2 ต้องมีผลที่หน้านี้ด้วย ไม่ใช่แค่ฉากเกม
   * ค่าเริ่มต้น: big1 เปิด · big2 ปิด · อุณหภูมิ 33.4°C (เกินเกณฑ์ 33)
   * → ปิด big1 ไม่ได้ เพราะเป็นตัวระบายความร้อนตัวสุดท้ายที่เหลือ
   */
  it('guard G2 · ปิดพัดลมใบใหญ่ตัวสุดท้ายตอนร้อน → โชว์กล่องคำเตือน (เลือกทำต่อ/ยกเลิกได้)', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('switch', { name: `${BIG1} — ${TH.stateOn}` }));

    // เดิมบล็อกเงียบ — ตอนนี้ขึ้นกล่อง "คำเตือนความปลอดภัย" ให้ยืนยันทำต่อหรือยกเลิก
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(TH.guardWarnTitle)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: TH.guardProceed })).toBeInTheDocument();
    // ยังไม่ส่งคำสั่งจนกว่าจะกดยืนยัน
    expect(screen.queryByText(TH.stateSending)).not.toBeInTheDocument();
  });

  it('เกณฑ์อุณหภูมิอัตโนมัติ: ป้ายทิศทางถูกต้อง (กัน min/max สลับ) + แก้ค่าได้จริง', async () => {
    const user = userEvent.setup();
    renderPage();

    // เกณฑ์อุณหภูมิ = เฉพาะพัดลมใหญ่ 2 ตัว (เล็กพ่วงใหญ่#2 · ปั๊มไม่ใช้เกณฑ์) → ป้ายละ 2 ที่
    expect(screen.getAllByText(TH.ghTempMinLabel)).toHaveLength(2);
    expect(screen.getAllByText(TH.ghTempMaxLabel)).toHaveLength(2);

    // แก้ค่า "สูงกว่า → เปิดพัดลม" ของ big1 (ค่าเริ่ม 31) ได้จริง
    const maxInput = screen.getByLabelText(`${BIG1} · ${TH.ghTempMaxLabel}`);
    expect(maxInput).toHaveValue(31);
    await user.clear(maxInput);
    await user.type(maxInput, '36');
    expect(maxInput).toHaveValue(36);
  });

  it('ปุ่มอัตโนมัติบนการ์ดสลับ auto/manual ได้ (ไม่มีปุ่มโหมด "มือ" แล้ว)', async () => {
    const user = userEvent.setup();
    renderPage();
    // อุปกรณ์เริ่มที่โหมดอัตโนมัติ (auto:true) → กดปุ่มอัตโนมัติ = สลับเป็น manual
    const autoBtn = screen.getByRole('button', { name: `${TH.pump} — ${TH.ghModeAuto}` });
    expect(autoBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(autoBtn);
    expect(screen.getByRole('button', { name: `${TH.pump} — ${TH.ghModeAuto}` })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('ตารางเวลา (slot): เลือกวัน + แก้เวลาเริ่ม/จบได้จริง', async () => {
    const user = userEvent.setup();
    renderPage();
    const auto = screen.getByRole('region', { name: TH.ghAutoTitle });

    // การ์ดเงื่อนไขแยกเป็นแท็บ "อุณหภูมิ / ตารางเวลา" (เริ่มที่อุณหภูมิ) — สลับไปแท็บตารางเวลาของใหญ่ #1 ก่อน
    await user.click(within(auto).getByRole('button', { name: `${BIG1} · ${TH.ghSchedTitle}` }));

    // ปั๊มไม่อยู่ในส่วนเกณฑ์อุณหภูมิแล้ว → ใช้พัดลมใหญ่ #1 · slot 1 เริ่มต้น 18:00–20:00 แก้เวลาเริ่มได้จริง
    const start = within(auto).getByLabelText(`${BIG1} · ${TH.ghSchedSlot(1)} · ${TH.ghSchedAt}`);
    expect(start).toHaveValue('18:00');
    await user.clear(start);
    await user.type(start, '05:30');
    expect(start).toHaveValue('05:30');

    // ปุ่มวัน (เสาร์) กดสลับติ๊ก/ไม่ติ๊กได้ (เริ่มต้นทุกวันติ๊ก)
    const sat = within(auto).getByRole('button', {
      name: `${BIG1} · ${TH.ghSchedSlot(1)} · sat`,
    });
    expect(sat).toHaveAttribute('aria-pressed', 'true');
    await user.click(sat);
    expect(sat).toHaveAttribute('aria-pressed', 'false');
  });

  it('guard เตือนเมื่อพัดลมใบใหญ่ทำงานพร้อมกันสองตัว', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText(TH.guardConflict)).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: TH.confirmYes }));

    expect(
      await screen.findByText(TH.guardConflict, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  /** ปุ่มหยุดฉุกเฉินย้ายไปอยู่แถบเมนู — ปุ่มเดียวของทั้งระบบ ไม่ใช่ของหน้านี้ */
  it('Emergency Stop จากแถบเมนู ตัดทุกอุปกรณ์และล็อกคำสั่ง', async () => {
    const user = userEvent.setup();
    renderPage();
    // มีปุ่มหยุดฉุกเฉินปุ่มเดียวในหน้า ไม่ใช่ปุ่มในแถบเมนูบวกปุ่มในตัวหน้าอีกอัน
    expect(screen.getAllByRole('button', { name: TH.estopFab })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: TH.estopFab }));

    expect(screen.getByText(TH.guardEmerg)).toBeInTheDocument();
    expect(screen.getAllByRole('switch').every((el) => el.hasAttribute('disabled'))).toBe(true);
    // อุปกรณ์ทั้ง 4 ถูกตัด → สวิตช์อุปกรณ์แสดง "ปิด" ครบ (จับเฉพาะสวิตช์อุปกรณ์ด้วย suffix "— ปิด")
    expect(screen.getAllByRole('switch', { name: new RegExp(`— ${TH.stateOff}$`) })).toHaveLength(
      4,
    );
  });

  /** ปลดล็อกต้องยืนยันก่อน — เดิมหน้านี้ปลดได้ในกดเดียว ต่างจากอีกสองหน้า */
  it('ปลดล็อกหยุดฉุกเฉินต้องยืนยันก่อน', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: TH.estopFab }));

    await user.click(screen.getByRole('button', { name: TH.unlockFab }));
    const dialog = await screen.findByRole('dialog', { name: TH.unlockTitle });
    expect(within(dialog).getByText(TH.unlockBody)).toBeInTheDocument();

    // ยังไม่ยืนยัน = ยังล็อกอยู่
    expect(screen.getByText(TH.guardEmerg)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: TH.confirmYes }));
    expect(screen.queryByText(TH.guardEmerg)).not.toBeInTheDocument();
  });

  // (ส่วน "ประวัติการสั่งงาน" ถอดออกจากหน้าโรงเรือนแล้ว — log ยังเห็นได้ในลิ้นชักหน้าชลประทาน
  //  คุมด้วย crossPage.test.tsx · การเขียน log ตอน estop คุมใน useEstop/crossPage)

  it('การ์ดควบคุมความชื้น: ปิดอยู่ไม่โชว์ช่อง · เปิดแล้วโชว์ช่องตั้งค่า + ป้ายเตือนทำงานเฉพาะตอนเปิดแอป', async () => {
    const user = userEvent.setup();
    renderPage();
    // การ์ดมีอยู่ · เริ่มปิด → ยังไม่โชว์ช่องตั้งค่า
    expect(screen.getByText(TH.humTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(TH.humOnAt)).not.toBeInTheDocument();
    // เปิดสวิตช์ → โชว์ช่อง RH เปิด/ปิด + ป้ายเตือน
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(screen.getByLabelText(TH.humOnAt)).toHaveValue(85);
    expect(screen.getByLabelText(TH.humOffAt)).toHaveValue(70);
    expect(screen.getByText(TH.humAppOnlyNote)).toBeInTheDocument();
    // เริ่มต้นไม่จำกัดเวลา → โชว์ป้าย "ทั้งวัน" · เปิดสวิตช์ช่วงเวลาแล้วโชว์ช่องเวลา
    expect(screen.getByText(TH.humWindowAll)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: TH.humUseWindow }));
    expect(screen.getByLabelText(`${TH.humWindow} · ${TH.ghSchedAt}`)).toBeInTheDocument();
  });

  it('สลับภาษาได้', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: EN.ghTitle })).toBeInTheDocument();
  });

  it('ทุกปุ่มมีชื่อ — ไม่มีปุ่มเปล่า', () => {
    renderPage();
    for (const btn of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent ?? '';
      expect(name.trim().length, `พบปุ่มไม่มีชื่อ: ${btn.outerHTML.slice(0, 120)}`).toBeGreaterThan(
        0,
      );
    }
  });
});
