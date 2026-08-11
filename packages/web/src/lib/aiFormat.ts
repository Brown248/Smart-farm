/**
 * จัดหน้าคำตอบของ AI ให้อ่านง่าย — **ไม่ใช้ markdown library**
 *
 * โมเดลถูกสั่งให้ตอบรูปแบบคงที่ (ดู `services/aiChat.ts`): บรรทัดสรุปหนึ่งบรรทัด
 * แล้วตามด้วยขั้นตอนแบบ `- ` ไม่เกิน 3 ข้อ · แต่ **โมเดลไม่เชื่อฟัง 100%**
 * ตัวนี้จึงรับได้ทั้ง `-` `*` `•` และรายการมีเลข แล้วแปลงให้เป็นโครงเดียวกันหมด
 *
 * ทำไมไม่ลง markdown library: ต้องการแค่ 3 อย่าง (ย่อหน้า · รายการ · ตัวหนา)
 * ไลบรารีเต็มตัวกิน bundle เป็นสิบ KB และเปิดช่องให้ HTML หลุดเข้ามา
 * ตัวนี้คืนเป็นโครงข้อมูลล้วน ให้ React เป็นคน render — **ไม่มี `dangerouslySetInnerHTML`**
 */

/** ชิ้นส่วนในหนึ่งบรรทัด — ตัวหนาเน้นตัวเลข/ชื่ออุปกรณ์ */
export interface AiSpan {
  readonly text: string;
  readonly strong: boolean;
}

export type AiBlock =
  | { readonly kind: 'para'; readonly spans: readonly AiSpan[] }
  | { readonly kind: 'list'; readonly items: readonly (readonly AiSpan[])[] };

/** ขึ้นต้นบรรทัดด้วยสัญลักษณ์รายการไหม — คืนเนื้อความที่ตัดสัญลักษณ์ออกแล้ว หรือ `null` */
function bulletBody(line: string): string | null {
  const m = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(line);
  return m?.[1] ?? null;
}

/**
 * แยก `**ตัวหนา**` ออกเป็นชิ้น — ดาวที่ไม่ได้จับคู่ถือเป็นตัวอักษรธรรมดา
 * (โมเดลพ่นดาวเดี่ยวมาบ่อย ถ้าไม่กันไว้จะเห็นดาวโผล่กลางประโยค)
 */
export function parseSpans(text: string): readonly AiSpan[] {
  const out: AiSpan[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), strong: false });
    out.push({ text: m[1] ?? '', strong: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), strong: false });
  return out.length > 0 ? out : [{ text, strong: false }];
}

/**
 * แปลงคำตอบดิบเป็นบล็อกที่ render ได้
 *
 * รวมรายการที่ติดกันเป็นบล็อกเดียว (ไม่งั้นจะได้ระยะห่างแปลกๆ ระหว่างข้อ)
 * และตัดบรรทัดว่างทิ้ง — โมเดลชอบเว้นบรรทัดคู่ซึ่งทำให้กล่องแชทโหว่
 */
export function formatAiReply(raw: string): readonly AiBlock[] {
  const blocks: AiBlock[] = [];
  let list: (readonly AiSpan[])[] | null = null;

  const flush = (): void => {
    if (list !== null && list.length > 0) blocks.push({ kind: 'list', items: list });
    list = null;
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const body = bulletBody(trimmed);
    if (body !== null) {
      if (body === '') continue; // "-" เปล่าๆ ไม่ใช่ข้อ
      list ??= [];
      list.push(parseSpans(body));
      continue;
    }

    flush();
    blocks.push({ kind: 'para', spans: parseSpans(trimmed) });
  }
  flush();

  // คำตอบว่างเปล่าไม่ควรได้กล่องเปล่า — ผู้เรียกเช็ค `length === 0` แล้วโชว์ข้อความสำรองแทน
  return blocks;
}
