import type { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HsControl from '@/services/handysenseControl';

/**
 * ปั๊มถูกระบบตัดเอง — **ห้ามเป็นเซอร์ไพรส์**
 *
 * 🔴 เจ้าของงานเจอเองหน้างาน (2026-08-10): กดเปิดปั๊มจากแอป HandySense
 * เว็บเราขึ้น "เปิด" ถูกต้อง แล้วอยู่ๆ ก็ดับไปเฉยๆ — หาสาเหตุไม่เจอ
 *
 * ตัวตัด 20 นาทีจับเวลาจาก `led2` ที่อุปกรณ์รายงาน **ไม่ได้ดูว่าใครสั่งเปิด** (จงใจ — เป็น safety ของทั้งฟาร์ม)
 * แต่ตอนนั้นเขียนแค่บรรทัดในสมุดบันทึก ซึ่งไม่มีใครเปิดดูตอนกำลังยืนงงอยู่หน้าปั๊ม
 * **ตัวตัดที่มองไม่เห็น = ตัวตัดที่ผู้ใช้ตีความว่าอุปกรณ์เสีย**
 */
vi.mock('@/services/handysenseControl', async (importOriginal) => {
  const actual = await importOriginal<typeof HsControl>();
  return {
    ...actual,
    readHsContext: () => ({ apiBase: 'https://x/api/v1', deviceId: 'dev', token: 'tok' }),
    postHsCommand: vi.fn().mockResolvedValue(undefined),
  };
});

import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import { PUMP_CUTOFF_MS } from '@/lib/deviceTiming';
import { ROUTES } from '@/routePaths';
import { postHsCommand } from '@/services/handysenseControl';
import { GreenhousePage } from '@/pages/GreenhousePage';
import { FarmStateProvider, useFarmState } from './FarmStateProvider';

/** `led2: 'true'` = อุปกรณ์รายงานว่าปั๊มเดินอยู่ — เหมือนตอนกดเปิดจากแอป HandySense */
const PUMP_ON = { led2: { value: 'true', timestamp: 1 } };

const Wrapper = ({ children }: { children: ReactNode }) => (
  <FarmStateProvider forceRealControl forceAttributes={PUMP_ON}>
    {children}
  </FarmStateProvider>
);
Wrapper.displayName = 'PumpCutoffWrapper';

const pumpOffCalls = (): number =>
  vi
    .mocked(postHsCommand)
    .mock.calls.filter(
      ([, cmd]) => cmd.action === 'setSwitch' && cmd.channel === 2 && cmd.on === false,
    ).length;

describe('auto-cutoff ปั๊ม — ต้องบอกล่วงหน้า ไม่ใช่ดับเงียบๆ', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(postHsCommand).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('อุปกรณ์รายงานว่าปั๊มเดิน (เปิดจากที่อื่น) → เริ่มนับถอยหลังทันที', () => {
    const { result } = renderHook(() => useFarmState(), { wrapper: Wrapper });
    expect(
      result.current.pumpCutoffAt,
      'ต้องรู้เวลาที่จะตัด ตั้งแต่เห็นว่าปั๊มเดิน',
    ).not.toBeNull();
    expect(result.current.pumpCutoffCount).toBe(0);
  });

  it('ครบเวลา → สั่งปิด relay จริง + เพิ่มตัวนับให้หน้าจอเด้ง toast', async () => {
    const { result } = renderHook(() => useFarmState(), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUMP_CUTOFF_MS + 1000);
    });

    expect(pumpOffCalls(), 'ต้องสั่งปิด ch2 จริง ไม่ใช่ปิดแค่ state ในเครื่อง').toBe(1);
    expect(result.current.pumpCutoffCount, 'สัญญาณให้หน้าจอเด้ง toast').toBe(1);
    expect(result.current.pumpCutoffAt, 'ตัดไปแล้ว เลิกนับ').toBeNull();
  });

  it('หน้าควบคุมโรงเรือนโชว์เวลาที่เหลือบนการ์ดปั๊ม (ไม่ใช่รู้ตอนดับไปแล้ว)', () => {
    render(
      <I18nProvider>
        <FarmStateProvider forceRealControl forceAttributes={PUMP_ON}>
          <MemoryRouter initialEntries={[ROUTES.greenhouse]}>
            <GreenhousePage />
          </MemoryRouter>
        </FarmStateProvider>
      </I18nProvider>,
    );

    // ข้อความถูกแบ่งเป็นหลาย text node (นับถอยหลัง · คำอธิบาย) — เทียบจาก textContent ของทั้งบรรทัด
    const live = screen
      .getAllByRole('status')
      .map((el) => el.textContent ?? '')
      .join('\n');

    // 20 นาทีเต็มตอนเพิ่งเริ่มนับ — และต้องบอกด้วยว่านับจากอะไร ไม่งั้นคนเปิดจากแอปอื่นยังงงอยู่ดี
    expect(live).toContain(TH.pumpCutoffIn('20:00'));
    expect(live).toContain(TH.pumpCutoffWhy);
  });
});
