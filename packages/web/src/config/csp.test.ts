import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CSP ต้องอนุญาตทุก origin ภายนอกที่ `index.html` เรียกใช้จริง
 *
 * 🔴 เคยพลาดมาแล้วตอน deploy ครั้งแรก และเป็นบั๊กที่ **ตรวจจาก header ไม่เจอ**
 * `index.html` โหลดฟอนต์ Prompt จาก Google Fonts แต่ CSP อนุญาตแค่ `'self'`
 * → ทั้งเว็บตกไปใช้ฟอนต์สำรองของระบบ **โดยไม่มี error บนหน้าจอ**
 * เห็นได้อย่างเดียวคือเปิดดูแล้วรู้สึกว่าตัวหนังสือหน้าตาเปลี่ยนไป (หรือเปิด console เจอ CSP violation)
 *
 * เทสนี้อ่านของจริงทั้งสองไฟล์แล้วจับคู่กัน — เพิ่ม `<link>`/`<script>` ไปที่โดเมนนอกใหม่
 * โดยลืมเติมใน CSP จะ fail ทันทีตั้งแต่บนเครื่อง ไม่ต้องรอไปเจอบนเซิร์ฟเวอร์
 */
const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const INDEX_HTML = read('../../index.html');
const CSP_SCRIPT = read('../../../../deploy/10-csp.envsh');

/** origin ภายนอกที่ index.html อ้างถึง (ตัด preconnect ที่ไม่ได้โหลดอะไรออกไม่ได้ — มันก็ต้องอนุญาตอยู่ดี) */
function externalOrigins(html: string): string[] {
  const found = html.match(/https:\/\/[a-z0-9.-]+/gi) ?? [];
  return [...new Set(found.map((u) => u.toLowerCase()))];
}

describe('CSP ครอบ origin ภายนอกที่หน้าเว็บใช้จริง', () => {
  it('ทุกโดเมนนอกที่ index.html เรียก ต้องมีใน CSP', () => {
    const origins = externalOrigins(INDEX_HTML);
    // กันเทสผ่านฟรีเพราะ regex จับไม่เจออะไรเลย
    expect(origins.length).toBeGreaterThan(0);

    for (const origin of origins) {
      expect(
        CSP_SCRIPT.includes(origin),
        `CSP ไม่ได้อนุญาต "${origin}" ที่ index.html เรียกใช้`,
      ).toBe(true);
    }
  });

  it('ฟอนต์ Prompt ต้องโหลดได้ — ทั้ง stylesheet และไฟล์ฟอนต์อยู่คนละโดเมน', () => {
    // googleapis = ตัว stylesheet (style-src) · gstatic = ไฟล์ฟอนต์ (font-src) ต้องมีทั้งคู่
    expect(CSP_SCRIPT).toContain('https://fonts.googleapis.com');
    expect(CSP_SCRIPT).toContain('https://fonts.gstatic.com');
    expect(CSP_SCRIPT).toMatch(/style-src[^;]*fonts\.googleapis\.com/);
    expect(CSP_SCRIPT).toMatch(/font-src[^;]*fonts\.gstatic\.com/);
  });

  it('ยังคงกัน clickjacking และจำกัดปลายทางของฟอร์มไว้เหมือนเดิม', () => {
    expect(CSP_SCRIPT).toContain("frame-ancestors 'self'");
    expect(CSP_SCRIPT).toContain("form-action 'self'");
    expect(CSP_SCRIPT).toContain("object-src 'none'");
  });
});
