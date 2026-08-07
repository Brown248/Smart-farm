import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES } from '@/routePaths';
import { GreenhousePage } from './GreenhousePage';
import { IrrigationPage } from './IrrigationPage';

/**
 * **ทุกหน้าที่สั่งอุปกรณ์ต้องผ่านห่วงโซ่กลาง `useDeviceCommand` (confirm/guard/pending) ไม่เขียน chain เอง**
 *
 * เดิมหน้าควบคุมโรงเรือนเขียนห่วงโซ่ของตัวเองแล้วข้าม guard — เทสระดับหน่วยจับไม่ได้เพราะฟังก์ชันถูก
 * ที่ผิดคือไม่มีใครเรียก เทสชุดนี้จึง **กดปุ่มจริงบนหน้าจริง**
 *
 * หมายเหตุ: guard G1 (ปั๊ม-ถังน้ำ) ถูกถอดออกแล้ว (ถังเป็น mock กันไม่ได้จริง) — แทนด้วย
 * ข้อความยืนยัน "เช็คน้ำก่อนเปิดปั๊ม" + auto-cutoff เทสนี้จึงยืนยันว่าเปิดปั๊ม = ขึ้นกล่องยืนยันจากห่วงโซ่กลาง
 * ส่วน G2 (พัดลมใบใหญ่) ยังบังคับใช้ — คุมไว้ใน `GreenhousePage.test.tsx`
 */
function renderAt(path: string, page: React.ReactNode) {
  return render(
    <I18nProvider>
      <FarmStateProvider>
        <RailStateProvider>
          <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
        </RailStateProvider>
      </FarmStateProvider>
    </I18nProvider>,
  );
}

describe('หน้าจอสั่งอุปกรณ์ผ่านห่วงโซ่กลาง (confirm) จริง ไม่เขียน chain เอง', () => {
  it('หน้าควบคุมโรงเรือน: เปิดปั๊มขึ้นกล่องยืนยัน "เช็คน้ำก่อน" (ผ่านห่วงโซ่กลาง)', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.greenhouse, <GreenhousePage />);

    await user.click(screen.getByRole('switch', { name: `${TH.pump} — ${TH.stateOff}` }));

    const dialog = await screen.findByRole('dialog');
    // ถ้อยคำยืนยันเจาะจงเรื่องเช็คน้ำ = มาจากห่วงโซ่กลาง ไม่ใช่ chain ของหน้านี้เอง
    expect(within(dialog).getByText(TH.confirmPumpBody)).toBeInTheDocument();
  });

  it('หน้าชลประทาน: ปุ่มรดน้ำกดได้ (ไม่ถูกปิดตามถังอีก) แล้วขึ้นยืนยันเช็คน้ำ', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.irrigation, <IrrigationPage />);

    const btn = screen.getByRole('button', { name: new RegExp(TH.ctStart) });
    expect(btn).not.toBeDisabled();

    await user.click(btn);
    const dialog = await screen.findByRole('dialog', { name: TH.waterTitle });
    expect(within(dialog).getByText(TH.confirmPumpBody)).toBeInTheDocument();
  });

  it('พัดลมสั่งผ่านห่วงโซ่กลาง — กดแล้วขึ้นกล่องยืนยัน', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.greenhouse, <GreenhousePage />);

    await user.click(screen.getByRole('switch', { name: `พัดลมใบใหญ่ #2 — ${TH.stateOff}` }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
