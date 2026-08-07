import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * กฎการเคลื่อนไหวของโปรเจกต์ — ตรวจจากไฟล์ CSS ตรงๆ
 * เพราะ jsdom ไม่คำนวณ CSS จริง เทสระดับ DOM จับเรื่องพวกนี้ไม่ได้เลย
 */
const SRC = join(__dirname, '..');

function cssFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, acc);
    else if (name.endsWith('.css')) acc.push(p);
  }
  return acc;
}

const files = cssFiles(SRC).map((p) => ({
  p: p.replace(SRC, '').replace(/\\/g, '/'),
  body: readFileSync(p, 'utf8'),
}));

/** ดึงเฉพาะเนื้อในบล็อก @keyframes ออกมา (ในนั้น animate property อะไรก็ได้) */
function withoutKeyframes(css: string): string {
  return css.replace(/@keyframes[\s\S]*?\n\}/g, '');
}

describe('กฎการเคลื่อนไหว', () => {
  /**
   * animate เฉพาะ transform/opacity — property ที่ trigger layout ทำให้กระตุกบนแท็บเล็ต
   * เคยพลาดมาแล้วสองครั้ง: แถบความชื้นโซนใช้ `width` · ลูกบิดสวิตช์ใช้ `left`
   */
  it('ไม่มี transition ของ property ที่ trigger layout', () => {
    const LAYOUT = ['width', 'height', 'left', 'right', 'top', 'bottom', 'margin', 'padding'];
    const bad: string[] = [];

    for (const { p, body } of files) {
      for (const m of withoutKeyframes(body).matchAll(/transition:([^;]+);/g)) {
        const decl = m[1]!;
        for (const prop of LAYOUT) {
          // จับเฉพาะตอนที่เป็นชื่อ property จริงๆ ไม่ใช่ส่วนหนึ่งของคำอื่น
          if (new RegExp(`(^|[\\s,])${prop}([\\s,]|$)`).test(decl)) {
            bad.push(`${p}: transition:${decl.trim()}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /** ทุกอย่างที่กดได้ต้องมีวงโฟกัส ไม่งั้นคนใช้คีย์บอร์ดไม่รู้ว่าอยู่ตรงไหน */
  it('ทุกไฟล์ที่มีของกดได้ ต้องมี focus-visible', () => {
    const missing = files
      .filter(({ body }) => {
        if (!/cursor:\s*pointer/.test(body)) return false;
        // ใช้ตัวกลางผ่าน composes ก็นับว่ามีแล้ว
        return !/focus-visible/.test(body) && !/composes:\s*(tap|ring)\b/.test(body);
      })
      .map(({ p }) => p);
    expect(missing).toEqual([]);
  });

  /** ค่าจังหวะกลางต้องมีอยู่จริง ไม่งั้น `var(--dur)` จะกลายเป็นค่าว่าง transition ไม่ทำงาน */
  it('มีตัวแปรจังหวะกลางครบ', () => {
    const shared = files.find((f) => f.p.endsWith('/styles/dashboard.module.css'))!;
    for (const v of ['--ease-out', '--dur', '--dur-fast']) {
      expect(shared.body, `ขาด ${v}`).toContain(`${v}:`);
    }
  });

  /** ใครใช้ var จังหวะกลาง ต้องมั่นใจว่าประกาศไว้แล้ว */
  it('ไม่มีไฟล์ไหนใช้ตัวแปรจังหวะที่ไม่ได้ประกาศ', () => {
    const declared = new Set<string>();
    for (const { body } of files) {
      for (const m of body.matchAll(/(--[\w-]+):/g)) declared.add(m[1]!);
    }
    const used = new Set<string>();
    for (const { body } of files) {
      for (const m of body.matchAll(/var\((--(?:dur|ease)[\w-]*)/g)) used.add(m[1]!);
    }
    expect([...used].filter((v) => !declared.has(v))).toEqual([]);
  });
});
