import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import { DEFAULT_HUMIDITY_AUTO } from '@/data/greenhouse';
import { HumidityBanner } from './GreenhousePage';

/**
 * ปิดสวิตช์ "ควบคุมความชื้น" = สั่งดับพัดลมจริง (ให้เหมือนปุ่มออโต้พัดลม `disableTempAuto`)
 * ถ้ากำลังดูดอยู่ + ร้อน >33°C → เตือน+ยืนยัน (กฎ G2) ก่อนปิด · นอกนั้น toggle ตรง
 */
type Props = Parameters<typeof HumidityBanner>[0];

function renderBanner(over: Partial<Props>) {
  const setHumidityAuto = vi.fn();
  const onConfirmAsk = vi.fn();
  render(
    <I18nProvider>
      <HumidityBanner
        humidityAuto={{ ...DEFAULT_HUMIDITY_AUTO, enabled: true }}
        setHumidityAuto={setHumidityAuto}
        ventStage={0}
        rhReal
        rh={88}
        temp={28}
        // ค่าเริ่มต้น = ไม่มีพัดลมใหญ่ตัวอื่นเดินอยู่ → G2 ตัดสินจากอุณหภูมิล้วน (เคสเดิมของเทสชุดนี้)
        bigFanStillRunningAfter={false}
        emergency={false}
        onConfirmAsk={onConfirmAsk}
        t={TH}
        {...over}
      />
    </I18nProvider>,
  );
  return { setHumidityAuto, onConfirmAsk };
}

describe('HumidityBanner — ปิดสวิตช์ = สั่งดับพัดลม', () => {
  it('กำลังดูด (stage≥1) + ร้อน >33°C → ปิด = เตือน+ยืนยัน (ยังไม่ปิดทันที)', async () => {
    const user = userEvent.setup();
    const { setHumidityAuto, onConfirmAsk } = renderBanner({ ventStage: 1, temp: 36 });
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(onConfirmAsk).toHaveBeenCalledTimes(1);
    expect(onConfirmAsk.mock.calls[0]?.[0].title).toBe(TH.guardWarnTitle);
    expect(setHumidityAuto).not.toHaveBeenCalled();
    // กดยืนยัน (run) → ปิดจริง
    onConfirmAsk.mock.calls[0]?.[0].run();
    expect(setHumidityAuto).toHaveBeenCalledWith({ enabled: false });
  });

  it('กำลังดูด + ไม่ร้อน (≤33°C) → ปิดทันที ไม่มีกล่อง', async () => {
    const user = userEvent.setup();
    const { setHumidityAuto, onConfirmAsk } = renderBanner({ ventStage: 1, temp: 30 });
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(onConfirmAsk).not.toHaveBeenCalled();
    expect(setHumidityAuto).toHaveBeenCalledWith({ enabled: false });
  });

  it('ยังไม่ได้ดูด (stage 0) แม้ร้อน → ปิดทันที (ไม่มีพัดลมให้ดับ)', async () => {
    const user = userEvent.setup();
    const { setHumidityAuto, onConfirmAsk } = renderBanner({ ventStage: 0, temp: 36 });
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(onConfirmAsk).not.toHaveBeenCalled();
    expect(setHumidityAuto).toHaveBeenCalledWith({ enabled: false });
  });

  /*
   * G2 ที่ถูกต้องคือ "ห้ามดับพัดลมใหญ่ **ตัวสุดท้าย** ขณะร้อน" — ถ้ายังมีอีกตัวเดินอยู่ก็ไม่ต้องเตือน
   * ของเดิมแบนเนอร์เช็คแค่อุณหภูมิ เลยเตือนทั้งที่ผู้ใช้เปิดใบ #2 ไว้เอง (เตือนพร่ำเพรื่อ = ไม่มีใครอ่าน)
   */
  it('ร้อนแต่ยังมีพัดลมใหญ่อีกตัวเดินอยู่ → ปิดทันที ไม่ต้องเตือน (G2 ไม่ติด)', async () => {
    const user = userEvent.setup();
    const { setHumidityAuto, onConfirmAsk } = renderBanner({
      ventStage: 1,
      temp: 36,
      bigFanStillRunningAfter: true,
    });
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(onConfirmAsk).not.toHaveBeenCalled();
    expect(setHumidityAuto).toHaveBeenCalledWith({ enabled: false });
  });

  it('ปิดอยู่ → เปิด = toggle ตรง ไม่มีกล่อง', async () => {
    const user = userEvent.setup();
    const { setHumidityAuto, onConfirmAsk } = renderBanner({
      humidityAuto: { ...DEFAULT_HUMIDITY_AUTO, enabled: false },
      ventStage: 0,
      temp: 36,
    });
    await user.click(screen.getByRole('switch', { name: TH.humEnable }));
    expect(onConfirmAsk).not.toHaveBeenCalled();
    expect(setHumidityAuto).toHaveBeenCalledWith({ enabled: true });
  });
});
