import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **ช่องแปะ token เองต้องไม่หลุดไป production**
 *
 * มันเป็นทางที่ 3 ของ `tokenProvider` มีไว้ให้พัฒนา/เดโมเท่านั้น
 * ถ้าหลุดขึ้น production จะกลายเป็นช่องให้ใครก็ตามแปะ token เข้ามาเอง
 *
 * ตรวจสองชั้น:
 *   1. ที่ที่ mount ต้องครอบด้วย `import.meta.env.DEV` — Vite แทนเป็น `false` ตอน build
 *      แล้ว rollup ตัดกิ่งนั้นทิ้ง (เทสระดับ source · ทำงานตลอดไม่ต้องรอ build)
 *   2. ถ้ามี `dist/` อยู่ ให้เช็ก bundle จริงว่าไม่มีข้อความของแผงนี้ติดไป
 */
const SRC = join(__dirname, '..');
const WEB = join(SRC, '..');

/** ข้อความไทยที่มีแต่ในแผง dev — ใช้เป็นตัวชี้ว่าโค้ดติดไปกับ bundle ไหม */
const DEV_ONLY_MARKER = 'แปะ access_token (dev)';

describe('แผงแปะ token ของ dev', () => {
  it('ที่ mount ครอบด้วย import.meta.env.DEV', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toContain('DevTokenPanel');
    // ต้องอยู่ในกิ่งของ import.meta.env.DEV จริง ไม่ใช่ render ตรงๆ
    expect(app).toMatch(/import\.meta\.env\.DEV\s*\?\s*<DevTokenPanel\s*\/>/);
  });

  it('ไม่มีที่อื่น mount แผงนี้โดยไม่ครอบเงื่อนไข', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) walk(p);
        else if (/\.tsx$/.test(p) && !p.includes('.test.')) {
          const body = readFileSync(p, 'utf8');
          if (!body.includes('<DevTokenPanel')) continue;
          if (p.endsWith('App.tsx')) continue;
          offenders.push(p.replace(SRC, ''));
        }
      }
    };
    walk(SRC);
    expect(offenders, 'mount แผง dev ได้ที่ App.tsx ที่เดียว').toEqual([]);
  });

  /** เช็ก bundle จริงถ้ามี — ข้ามไปถ้ายังไม่ได้ build (เช่นตอนรัน watch) */
  it('ไม่มีข้อความของแผง dev ใน production bundle', () => {
    const assets = join(WEB, 'dist', 'assets');
    if (!existsSync(assets)) {
      expect(true, 'ยังไม่ได้ build — ข้ามการเช็ก bundle').toBe(true);
      return;
    }
    const found = readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => readFileSync(join(assets, f), 'utf8').includes(DEV_ONLY_MARKER));

    expect(found, 'แผง dev ติดไปกับ bundle — เช็กว่า mount ครอบ import.meta.env.DEV อยู่').toEqual(
      [],
    );
  });
});
