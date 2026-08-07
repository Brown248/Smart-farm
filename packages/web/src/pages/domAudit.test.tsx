import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { TH } from '@/i18n/th';
import { ROUTES } from '@/routePaths';
import { AppRoutes } from '@/routes';

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

/** ชื่อที่ AT จะอ่านให้ผู้ใช้ฟัง */
function accName(el: Element): string {
  return (
    el.getAttribute('aria-label') ??
    el.getAttribute('title') ??
    (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  );
}

describe('ตรวจ DOM ระดับหน้า', () => {
  it.each(PAGES)('%s: ไม่มี id ซ้ำ', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    expect([...new Set(dup)]).toEqual([]);
  });

  it.each(PAGES)('%s: มี <h1> ตัวเดียว', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    expect(container.querySelectorAll('h1').length).toBe(1);
  });

  it.each(PAGES)('%s: ปุ่มไม่มีชื่อซ้ำกัน', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const names = [...container.querySelectorAll('button')].map(accName).filter(Boolean);
    const dup = names.filter((v, i) => names.indexOf(v) !== i);
    expect([...new Set(dup)]).toEqual([]);
  });

  it.each(PAGES)('%s: landmark ไม่มีชื่อซ้ำกัน', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const names = [...container.querySelectorAll('section[aria-label],nav[aria-label]')].map((e) =>
      e.getAttribute('aria-label'),
    );
    const dup = names.filter((v, i) => names.indexOf(v) !== i);
    expect([...new Set(dup)]).toEqual([]);
  });

  it.each(PAGES)('%s: ไม่มี aria-* สะกดผิด/ค่าไม่ถูก', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const bad: string[] = [];
    for (const el of container.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (!a.name.startsWith('aria-')) continue;
        if (a.value === 'undefined' || a.value === 'null' || a.value === '[object Object]') {
          bad.push(`${el.tagName}.${a.name}="${a.value}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(PAGES)('%s: ไม่มีข้อความ NaN / undefined โผล่บนหน้า', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const text = container.textContent ?? '';
    for (const bad of ['NaN', 'undefined', 'null', '[object Object]']) {
      expect(text.includes(bad), `เจอ "${bad}" บนหน้า`).toBe(false);
    }
  });

  it.each(PAGES)('%s: ทุก img มี alt', async (path, heading) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { name: heading });
    const noAlt = [...container.querySelectorAll('img')].filter(
      (i) => i.getAttribute('alt') === null,
    );
    expect(noAlt.map((i) => i.getAttribute('src'))).toEqual([]);
  });
});
