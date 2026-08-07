import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES, NAV_ITEMS } from '@/routePaths';
import { AppRoutes } from '@/routes';

function renderAt(path: string) {
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

/** ชื่อหัวข้อที่ใช้ยืนยันว่าอยู่หน้าไหน */
const PAGE_HEADING: Readonly<Record<string, string>> = {
  [ROUTES.dashboard]: TH.pageTitle,
  [ROUTES.irrigation]: TH.irrTitle,
  [ROUTES.greenhouse]: TH.ghTitle,
};

describe('การเดินทางระหว่างหน้า', () => {
  it.each(Object.entries(PAGE_HEADING))('เปิด %s ตรงๆ แล้วได้หน้าที่ถูก', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('เปิด url ที่ไม่มีอยู่ → กลับมาฉากฟาร์ม ไม่ใช่หน้าเปล่า', async () => {
    renderAt('/calendar');
    expect(await screen.findByAltText(TH.agentName)).toBeInTheDocument();
  });

  /**
   * ทุกหน้าข้อมูลต้องออกไปหน้าอื่นได้ ไม่มีทางตัน
   * เมนูใน rail ต้องมีรายการที่กดไปได้จริงมากกว่า 1 (ตัวเองไม่นับ)
   */
  it.each(Object.keys(PAGE_HEADING))('%s มีทางออกไปหน้าอื่นได้จริง', async (path) => {
    const user = userEvent.setup();
    renderAt(path);

    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getByRole('button', { name: new RegExp(TH.navFarmGame) }));
    expect(await screen.findByAltText(TH.agentName)).toBeInTheDocument();
  });

  /** เดินครบทุกหน้าแล้วกลับ ใช้เวลานานกว่าเทสอื่นเป็นปกติ */
  it('เมนูในฉากเกมพาไปได้ครบทุกหน้าที่เปิดใช้แล้ว', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.farm);

    for (const item of NAV_ITEMS.filter((n) => !n.soon && n.to !== ROUTES.farm)) {
      await user.click(screen.getByRole('button', { name: TH.menuTitle }));
      await user.click(await screen.findByRole('button', { name: new RegExp(TH[item.key]) }));

      const heading = PAGE_HEADING[item.to ?? ''];
      if (heading === undefined) throw new Error(`ไม่รู้จักหน้า ${item.to} — เพิ่มใน PAGE_HEADING`);
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();

      // กลับฉากเกมเพื่อวนรอบถัดไป
      const nav = screen.getByRole('navigation');
      await user.click(within(nav).getByRole('button', { name: new RegExp(TH.navFarmGame) }));
      await screen.findByAltText(TH.agentName);
    }
  });

  /** ปุ่มทุกตัวต้องมีชื่อให้ screen reader อ่าน ไม่งั้นเป็นปุ่มไร้ชื่อ */
  it.each(Object.entries(PAGE_HEADING))('%s: ปุ่มทุกตัวมีชื่อที่อ่านได้', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });

    const nameless = [...container.querySelectorAll('button')].filter(
      (b) =>
        !(b.textContent ?? '').trim() &&
        !b.getAttribute('aria-label') &&
        !b.getAttribute('aria-labelledby') &&
        !b.getAttribute('title'),
    );
    expect(nameless.map((b) => b.outerHTML.slice(0, 90))).toEqual([]);
  });
});
