import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES } from '@/routePaths';
import { AppRoutes } from '@/routes';
import { setReducedMotion } from '@/test/setup';
import { AUTH_STORAGE_KEY } from '@/services/supabaseAuth';

const PAGES: readonly (readonly [string, string])[] = [
  [ROUTES.dashboard, TH.pageTitle],
  [ROUTES.irrigation, TH.irrTitle],
  [ROUTES.greenhouse, TH.ghTitle],
];

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

/** กฎเหล็กที่ต้องจริงทุกหน้า ไม่ใช่แค่หน้าที่นึกได้ตอนเขียนเทส */
describe('กฎเหล็ก — ตรวจทุกหน้าข้อมูล', () => {
  it.each(PAGES)(
    '%s: ไม่แตะ localStorage/sessionStorage เลย',
    { timeout: 20000 },
    async (path, heading) => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const user = userEvent.setup();

      renderAt(path);
      await screen.findByRole('heading', { name: heading });
      // พับเมนูและสลับภาษา — สองอย่างที่มักถูกเผลอเก็บลง storage
      // (พับก่อน เพราะพอสลับเป็น EN แล้วป้ายปุ่มจะเปลี่ยนภาษาตาม)
      await user.click(screen.getByRole('button', { name: TH.toggleMenu }));
      await user.click(screen.getByRole('button', { name: 'EN' }));

      /*
       * ข้อยกเว้นเดียวที่เจ้าของงานอนุมัติ: **session ของ auth**
       * Supabase ต้องเก็บ session ไว้ ไม่งั้น refresh หน้าแล้วต้องล็อกอินใหม่ทุกครั้ง
       * (ใช้บนแท็บเล็ตที่เปิดค้างทั้งวัน) — ตั้ง `storageKey` เองเพื่อให้อนุญาตแบบเจาะจงได้
       *
       * ห้ามขยายข้อยกเว้นนี้ไปให้ค่าอื่น — ภาษา · การพับเมนู · เกณฑ์ ยังห้ามเก็บลง storage
       */
      const offending = (spy: typeof getItem): string[] =>
        spy.mock.calls.map((c) => String(c[0])).filter((k) => !k.startsWith(AUTH_STORAGE_KEY));

      expect(offending(getItem), 'อ่าน storage ด้วยคีย์ที่ไม่ใช่ session ของ auth').toEqual([]);
      expect(offending(setItem), 'เขียน storage ด้วยคีย์ที่ไม่ใช่ session ของ auth').toEqual([]);
    },
  );

  it.each(PAGES)('%s: reduced-motion แล้วไม่มี animation ต่อเนื่องค้าง', async (path, heading) => {
    setReducedMotion(true);
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });

    // อะไรที่ตั้ง `infinite` ผ่าน inline style จะไม่ถูก CSS ระดับ global ปิดเสมอไป
    // จึงต้องไม่มีเหลืออยู่ตั้งแต่ตอน render
    const looping = [...container.querySelectorAll<HTMLElement>('[style*="infinite"]')];
    expect(looping.map((el) => el.getAttribute('style'))).toEqual([]);
  });

  it.each(PAGES)('%s: ทุก input ที่มองเห็นแก้ค่าได้จริง ไม่ใช่ readOnly', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });

    const frozen = [...container.querySelectorAll<HTMLInputElement>('input')].filter(
      (i) => i.readOnly && !i.disabled,
    );
    expect(frozen.map((i) => i.outerHTML.slice(0, 90))).toEqual([]);
  });
});
