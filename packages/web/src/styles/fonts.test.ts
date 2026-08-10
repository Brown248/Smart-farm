import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ฟอนต์ตัวเลขต้องหน้าตาเดียวกันทุกหน้า — และ **ต้องถูกโหลดจริง**
 *
 * 🔴 เคยพลาดมาแล้ว (ดู DESIGN_SOURCE ข้อ 34): `tokens.css` ประกาศ
 * `--font-num: 'IBM Plex Mono', 'Prompt', monospace` มาตั้งแต่ต้น และทุกจุดก็เรียกใช้ถูก
 * **แต่ `index.html` ไม่เคยโหลด IBM Plex Mono เลย** (หล่นตอนพอร์ตจากต้นแบบ)
 * ตัวเลขจึงขึ้นกับว่าเครื่องที่เปิดบังเอิญมีฟอนต์นี้ติดตั้งไว้หรือเปล่า
 * → นักพัฒนาที่ลงไว้เห็นเป็น mono · ผู้ใช้จริงเห็นเป็น Prompt · **ไม่มี error ฟ้องสักตัว**
 *
 * เทสนี้จับสี่อย่างที่ตาคนมองผ่านได้ง่ายแต่ทำให้ตัวเลขไม่ตรงกัน
 */
/*
 * ⚠️ อย่าเขียน `new URL('../x', import.meta.url)` ด้วยสตริงคงที่ในไฟล์นี้
 * Vite มีการแปลงพิเศษสำหรับรูปแบบนั้น (ใช้อ้าง asset) → ตอนรันเทสจะกลายเป็น
 * `http://localhost:3000/x` แล้ว `fileURLToPath` โยน "The URL must be of scheme file"
 * (ถ้าอาร์กิวเมนต์เป็นตัวแปร Vite จะไม่แตะ — ซึ่งเป็นเหตุผลที่ `csp.test.ts` รอดมาได้)
 * ใช้ `dirname`/`join` บนพาธจริงแทน ตรงไปตรงมาและไม่โดนแปลง
 */
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB = dirname(SRC);
const read = (abs: string): string => readFileSync(abs, 'utf8');

const INDEX_HTML = read(join(WEB, 'index.html'));
const TOKENS = read(join(SRC, 'styles', 'tokens.css'));

/** ไล่เก็บไฟล์ตามนามสกุลใต้ src ทั้งหมด */
function filesUnder(dir: string, ext: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const CSS_FILES = filesUnder(SRC, ['.css']);
const CODE_FILES = filesUnder(SRC, ['.tsx', '.ts']).filter((f) => !f.includes('.test.'));

/** แยกไฟล์ css ออกเป็นบล็อกกฎ (พอสำหรับ CSS Modules ที่ไม่มี nesting) */
function rules(css: string): string[] {
  return css.match(/\{[^{}]*\}/g) ?? [];
}

describe('ฟอนต์ตัวเลขต้องเป็นชุดเดียวกันทั้งระบบ', () => {
  it('index.html โหลดทั้ง Prompt และ IBM Plex Mono', () => {
    // ทั้งสองตัวอยู่ในสตริง href เดียวกัน คั่นด้วย &family= — เช็กชื่อแบบที่ Google Fonts เขียน
    expect(INDEX_HTML).toContain('family=Prompt:');
    expect(INDEX_HTML).toContain('family=IBM+Plex+Mono:');
  });

  it('โหลดน้ำหนักฟอนต์ครอบคลุมที่ CSS ใช้จริง — ไม่ปล่อยให้เบราว์เซอร์ faux-bold', () => {
    // faux-bold ของฟอนต์ mono เส้นจะเละและหนาไม่เท่าจุดอื่นที่ขอน้ำหนักที่โหลดมาจริง
    const spec = /family=IBM\+Plex\+Mono:wght@([0-9;]+)/.exec(INDEX_HTML);
    expect(spec, 'index.html ต้องระบุน้ำหนักของ IBM Plex Mono').not.toBeNull();
    const loaded = new Set((spec?.[1] ?? '').split(';').map(Number));

    for (const file of CSS_FILES) {
      for (const rule of rules(readFileSync(file, 'utf8'))) {
        if (!rule.includes('var(--font-num)')) continue;
        const w = /font-weight:\s*(\d{3})/.exec(rule);
        if (!w?.[1]) continue;
        expect(
          loaded.has(Number(w[1])),
          `${file}: ใช้ --font-num กับ font-weight ${w[1]} แต่ index.html ไม่ได้โหลดน้ำหนักนี้`,
        ).toBe(true);
      }
    }
  });

  it('ทุกกฎที่ใช้ --font-num ต้องตั้ง tnum ด้วย (ตัวเลขกว้างเท่ากัน อ่านไล่คอลัมน์ได้)', () => {
    const missing: string[] = [];
    for (const file of CSS_FILES) {
      for (const rule of rules(readFileSync(file, 'utf8'))) {
        if (rule.includes('var(--font-num)') && !rule.includes('tnum')) {
          missing.push(file.replace(SRC, ''));
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('ห้ามเขียนชื่อฟอนต์ลงไปตรงๆ นอก tokens.css — ต้องผ่าน token เท่านั้น', () => {
    // เขียนตรงๆ = ไม่มี fallback ตามที่ token กำหนด และแก้ที่เดียวไม่ครบ
    // (`RingGauge` เคยใส่ fontFamily="IBM Plex Mono" ใน <text> ของ SVG ซึ่งถ้าโหลดไม่ติด
    //  จะตกไปเป็น serif ของเบราว์เซอร์ ไม่ใช่ Prompt เหมือนที่อื่น)
    const bad: string[] = [];
    for (const file of [...CSS_FILES, ...CODE_FILES]) {
      if (file.endsWith('tokens.css')) continue;
      // ตัดคอมเมนต์ทิ้งก่อน — คอมเมนต์ที่อธิบายกับดักนี้เอ่ยชื่อฟอนต์อยู่ (กับดักข้อ 3 ใน CLAUDE.md)
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/IBM Plex Mono|['"]Prompt['"]/.test(src)) bad.push(file.replace(SRC, ''));
    }
    expect(bad).toEqual([]);
  });

  it('tokens.css ยังเป็นเจ้าของ --font-num และมี fallback ครบ', () => {
    expect(TOKENS).toMatch(/--font-num:\s*'IBM Plex Mono',\s*'Prompt',\s*monospace/);
  });
});
