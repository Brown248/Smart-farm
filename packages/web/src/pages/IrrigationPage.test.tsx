import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { EN } from '@/i18n/en';
import { IRR_ZONES } from '@/data/irrigation';
import { ROUTES } from '@/routePaths';
import { IrrigationPage } from './IrrigationPage';

function renderPage() {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <MemoryRouter initialEntries={[ROUTES.irrigation]}>
          <IrrigationPage />
        </MemoryRouter>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

const STATUS_TEXT = {
  watering: TH.lgWatering,
  normal: TH.lgNormal,
  warn: TH.lgWatch,
  dry: TH.lgDry,
} as const;

/** ปุ่มหลักของแปลง — ชื่อเต็มกันชนกับปุ่มเซนเซอร์ที่ขึ้นต้นเหมือนกัน */
const zoneBtn = (letter: string) => {
  const z = IRR_ZONES.find((x) => x.letter === letter)!;
  const crop = TH[z.cropKey] as string;
  return screen.getByRole('button', {
    name: `${TH.zoneLetterPrefix}${letter} · ${crop} · ${z.moisture}% · ${STATUS_TEXT[z.status]}`,
  });
};

/**
 * 🔴 เทสเรื่อง "รดน้ำ" ทั้งหมดถูกถอดออก 2026-08-11 (8 เคส)
 *
 * โรงเรือนนี้**ไม่มีระบบรดน้ำ** — ปั๊มที่มีคือปั๊มคูลลิ่งแพด ทำงานคู่พัดลมใหญ่
 * เทสที่หายไป: ปุ่มรดน้ำทั้งฟาร์ม · 8 แปลงขึ้น "กำลังรดน้ำ" · estop ล็อกปุ่มรดน้ำ ·
 * กลยุทธ์รดน้ำ (hybrid/ตั้งเวลา/ตามความชื้น) · ส่วนระบบน้ำ
 * ตัวปั๊มมีเทสของตัวเองที่ `state/padPump.test.tsx` แทน (ดู DESIGN_SOURCE ข้อ 37)
 */
describe('IrrigationPage', () => {
  it('พยากรณ์อากาศดึงไม่ได้ในเทส (fetch ถูก stub) → แสดง empty state ไม่โชว์ตัวเลขปลอม', () => {
    renderPage();
    // useWeather คืน null (เน็ตถูกปิดในเทส) → ต้องขึ้น empty state · ไม่มีตัวเลข "31°C" ปลอม
    expect(screen.getByText(TH.wxUnavailable)).toBeInTheDocument();
  });

  it('แผนที่มีครบ 8 แปลง ใช้โซนชุดเดียวกับหน้าอื่น', () => {
    renderPage();
    expect(IRR_ZONES).toHaveLength(8);
    for (const z of IRR_ZONES) {
      expect(zoneBtn(z.letter)).toBeInTheDocument();
    }
  });

  it('สลับเลเยอร์แผนที่ได้', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('button', { name: TH.layerStatus })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: TH.layerMoisture }));
    expect(screen.getByRole('button', { name: TH.layerMoisture })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  /** ระบบน้ำ (ถัง/แรงดัน/ปริมาณน้ำ) ถอดออกหมดแล้ว — ยังไม่มีเซนเซอร์จริง (เจ้าของงานสั่ง) */
  /** สถานะปั๊มบนการ์ดรดน้ำต้องขยับตามการสั่งจริง — ปั๊มคุมด้วยปุ่ม "รดน้ำทั้งโรงเรือน" */
  it('Needs Attention (คำนวณจากดินจริง) กดแล้วเปิดลิ้นชักของโซนนั้น', async () => {
    const user = userEvent.setup();
    renderPage();
    // โซน G (สตรอว์เบอร์รี) ดินแห้ง → โผล่ในรายการ "ต้องดูแลด่วน" ที่คำนวณจากสถานะจริง
    const attn = screen.getByRole('region', { name: TH.attnTitle });
    await user.click(within(attn).getByRole('button', { name: new RegExp(TH.crop_strawberry) }));
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}G` });
    expect(within(drawer).getByText(new RegExp(TH.crop_strawberry))).toBeInTheDocument();
  });

  it('ลิ้นชักเหลือ 4 แท็บข้อมูล และสลับได้', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(zoneBtn('A'));
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}A` });

    // "ควบคุม" กับ "อัตโนมัติ" ย้ายขึ้นไปเป็นของทั้งฟาร์มแล้ว
    const tabs = within(drawer).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(within(drawer).getByText(TH.ovMoist)).toBeInTheDocument();

    await user.click(within(drawer).getByRole('tab', { name: TH.tabSensors }));
    expect(within(drawer).getByText(TH.dsSoil)).toBeInTheDocument();

    await user.click(within(drawer).getByRole('tab', { name: TH.tabHistory }));
    expect(within(drawer).getByText(TH.hist1d)).toBeInTheDocument();
  });

  /** ปั๊มตัวเดียว ไม่มีวาล์วแยกแปลง → สั่งรดน้ำได้ที่เดียวคือระดับทั้งโรงเรือน */
  /**
   * หัวใจของการตัดรายแปลงออก — ปั๊มตัวเดียวจ่ายน้ำทั้งโรงเรือน
   * เปิดทีเดียวต้องขึ้น "กำลังรดน้ำ" ครบทั้ง 8 แปลง ไม่ใช่แปลงใดแปลงหนึ่ง
   */
  it('ไม่มีปุ่มสั่งงานในลิ้นชักรายแปลงแล้ว', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(zoneBtn('B'));
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}B` });

    expect(
      within(drawer).queryByRole('button', { name: new RegExp(TH.ctStart) }),
    ).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/วาล์ว/)).not.toBeInTheDocument();
  });

  /** ปุ่มหยุดฉุกเฉินอยู่ในแถบเมนู ปุ่มเดียวของทั้งระบบ ไม่ได้ซ้ำอยู่ในตัวหน้า */
  it('แท็บตั้งค่า: input แก้ได้จริงและกดบันทึกแล้วมีข้อความยืนยัน', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(zoneBtn('C'));
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}C` });
    await user.click(within(drawer).getByRole('tab', { name: TH.tabSettings }));

    const nameInput = within(drawer).getByLabelText(TH.setName);
    expect(nameInput).toHaveValue(`${TH.zoneLetterPrefix}C`);
    await user.clear(nameInput);
    await user.type(nameInput, 'แปลงสมุนไพร');
    expect(nameInput).toHaveValue('แปลงสมุนไพร');

    expect(within(drawer).queryByText(TH.settingsSavedMsg)).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: TH.saveSettings }));
    expect(within(drawer).getByText(TH.settingsSavedMsg)).toBeInTheDocument();
  });

  it('แท็บตั้งค่า: สลับการแจ้งเตือนได้', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(zoneBtn('C'));
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}C` });
    await user.click(within(drawer).getByRole('tab', { name: TH.tabSettings }));

    // หมวดแจ้งเตือนเปิดครบทุกหมวดเป็นค่าเริ่มต้น — ปิดได้จริง (ค่าอยู่ใน provider ทั้งฟาร์ม)
    const sw = within(drawer).getByRole('switch', { name: TH.ntDevice });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('ปุ่มเซนเซอร์บนแปลงเปิดลิ้นชักที่แท็บเซนเซอร์โดยตรง', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole('button', { name: `${TH.zoneLetterPrefix}D · ${TH.mapSensor}` }),
    );
    const drawer = await screen.findByRole('dialog', { name: `${TH.zoneLetterPrefix}D` });
    expect(within(drawer).getByText(TH.dsSoil)).toBeInTheDocument();
  });

  it('สลับภาษาได้', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: EN.irrTitle })).toBeInTheDocument();
  });

  it('ทุกปุ่มมีชื่อ — ไม่มีปุ่มเปล่า', () => {
    renderPage();
    for (const btn of screen.getAllByRole('button')) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent ?? '';
      expect(name.trim().length, `พบปุ่มไม่มีชื่อ: ${btn.outerHTML.slice(0, 120)}`).toBeGreaterThan(
        0,
      );
    }
  });
});
