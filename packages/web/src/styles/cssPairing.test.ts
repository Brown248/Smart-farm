import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * **สไตล์หายเงียบๆ ต้องไม่เกิดอีก**
 *
 * ตอนย้ายบล็อกระบบน้ำจาก `IrrigationPage.module.css` ไป `GreenhousePage.module.css`
 * บล็อก "แผนที่ฟาร์ม" 359 บรรทัดติดไปด้วย ทั้งที่หน้าโรงเรือนไม่มีแผนที่
 * ผลคือแผนที่แปลงบนหน้าชลประทานแสดงแบบไม่มีสไตล์เลย —
 * `s.mapWrap` `s.bed` `s.hoverCard` resolve เป็น `undefined`
 *
 * CSS Modules คืน `undefined` เงียบๆ เมื่อไม่มีคลาสนั้น `tsc` ไม่ฟ้อง jsdom ก็ไม่คำนวณ CSS
 * ไม่มีอะไรในระบบจับได้เลยนอกจากเปิดดูด้วยตา — เทสนี้จึงจับแทน (กับดักข้อ 2b ใน CLAUDE.md)
 */
const SRC = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const rel = (p: string) => p.replace(SRC, '').replace(/\\/g, '/');

/**
 * ตัดคอมเมนต์กับสตริงออกก่อน ไม่งั้นชื่อไฟล์ในคอมเมนต์ (`AppRail.module.css`)
 * หรือใน `composes: … from '…'` จะถูกนับเป็นคลาสไปด้วย
 */
function selectorsOnly(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'[^']*'|"[^"]*"/g, ' ');
}

/** คลาสอาจอยู่ในบรรทัดที่ย่อหน้า (ใน `@media`) หรือเป็น selector ซ้อน จึงต้องกวาดทั้งไฟล์ */
function declaredClasses(css: string): Set<string> {
  return new Set([...selectorsOnly(css).matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!));
}

interface Usage {
  readonly classes: Set<string>;
  /** มีไฟล์ที่หยิบคลาสด้วยตัวแปร (`styles[variant]`) — เช็ก "คลาสที่ไม่มีใครใช้" ไม่ได้ */
  dynamic: boolean;
}

const files = walk(SRC);
const cssModules = files.filter((p) => p.endsWith('.module.css'));

/**
 * ไล่จาก import จริงว่าไฟล์ไหนใช้โมดูลไหน — โมดูลหนึ่งอาจถูกใช้จากหลายไฟล์
 * (`RuleNumberInput.tsx` ใช้ `AdvancedPanel.module.css`) ถ้าดูแค่ไฟล์ชื่อเดียวกันจะสรุปผิด
 */
const usageOf = new Map<string, Usage>(
  cssModules.map((p) => [p, { classes: new Set<string>(), dynamic: false }]),
);

for (const tsx of files.filter((p) => p.endsWith('.tsx') && !p.includes('.test.'))) {
  const body = readFileSync(tsx, 'utf8');
  for (const m of body.matchAll(/import\s+(\w+)\s+from\s+'([^']+\.module\.css)'/g)) {
    const [, id, spec] = m as unknown as [string, string, string];
    const target = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(tsx), spec);
    const usage = usageOf.get(target);
    if (!usage) continue;
    for (const u of body.matchAll(new RegExp(`\\b${id}\\.([A-Za-z0-9_]+)`, 'g'))) {
      usage.classes.add(u[1]!);
    }
    if (new RegExp(`\\b${id}\\[`).test(body)) usage.dynamic = true;
  }
}

/** เอาเฉพาะโมดูลที่มี component ชื่อเดียวกันอยู่ข้างๆ — โมดูลกลางอย่าง dashboard ใช้ร่วมกันหลายที่ */
const pairs = cssModules
  .filter((css) => existsSync(css.replace(/\.module\.css$/, '.tsx')))
  .map((css) => ({
    name: rel(css),
    own: rel(css.replace(/\.module\.css$/, '.tsx')),
    declared: declaredClasses(readFileSync(css, 'utf8')),
    usedInOwnFile: new Set(
      [
        ...readFileSync(css.replace(/\.module\.css$/, '.tsx'), 'utf8').matchAll(
          /\b(?:s|styles)\.([A-Za-z0-9_]+)/g,
        ),
      ].map((m) => m[1]!),
    ),
    usage: usageOf.get(css)!,
  }));

describe('คลาส CSS ต้องจับคู่กับไฟล์ที่ใช้จริง', () => {
  it('มีโมดูลให้ตรวจ (กันเทสผ่านเพราะหาไฟล์ไม่เจอ)', () => {
    expect(pairs.length).toBeGreaterThan(5);
    expect(pairs.map((p) => basename(p.name))).toContain('IrrigationPage.module.css');
  });

  it('ทุกคลาสที่ tsx เรียกใช้ ต้องมีอยู่จริงในโมดูลของตัวเอง', () => {
    const missing: string[] = [];
    for (const { name, declared, usedInOwnFile } of pairs) {
      for (const cls of usedInOwnFile) if (!declared.has(cls)) missing.push(`${name} → s.${cls}`);
    }
    expect(missing, 'คลาสพวกนี้จะ resolve เป็น undefined ตอน render').toEqual([]);
  });

  it('ไม่มีคลาสที่ประกาศทิ้งไว้แล้วไม่มีใครใช้', () => {
    const orphan: string[] = [];
    for (const { name, declared, usage } of pairs) {
      if (usage.dynamic) continue;
      for (const cls of declared) if (!usage.classes.has(cls)) orphan.push(`${name} → .${cls}`);
    }
    expect(orphan, 'ลบทิ้ง หรือถ้ายังจะใช้ ให้ต่อเข้ากับ tsx ให้เรียบร้อย').toEqual([]);
  });
});
