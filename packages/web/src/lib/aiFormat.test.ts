import { describe, expect, it } from 'vitest';
import { formatAiReply, parseSpans } from './aiFormat';

/**
 * คำตอบ AI ต้องอ่านง่ายบนแท็บเล็ตกลางโรงเรือน
 *
 * โมเดลถูกสั่งรูปแบบไว้แล้วแต่**ไม่เชื่อฟัง 100%** — เทสชุดนี้จึงยิงของที่โมเดลพ่นมาจริง
 * (สัญลักษณ์รายการหลายแบบ · บรรทัดว่างคู่ · ดาวเดี่ยวที่ไม่ได้จับคู่)
 */
describe('จัดหน้าคำตอบ AI', () => {
  it('บรรทัดสรุป + รายการขั้นตอน → ย่อหน้าหนึ่งอัน ตามด้วยรายการหนึ่งบล็อก', () => {
    const blocks = formatAiReply('อากาศร้อนเกินเกณฑ์\n- เปิดพัดลมใบใหญ่ #1\n- รอ 15 นาทีแล้วดูซ้ำ');

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: 'para',
      spans: [{ text: 'อากาศร้อนเกินเกณฑ์', strong: false }],
    });
    expect(blocks[1]?.kind).toBe('list');
    if (blocks[1]?.kind === 'list') expect(blocks[1].items).toHaveLength(2);
  });

  it('รับสัญลักษณ์รายการได้หลายแบบ — โมเดลสลับใช้ - * • และเลขข้อ', () => {
    const blocks = formatAiReply('- ก\n* ข\n• ค\n1. ง\n2) จ');
    expect(blocks).toHaveLength(1);
    if (blocks[0]?.kind === 'list') expect(blocks[0].items).toHaveLength(5);
  });

  it('บรรทัดว่างคู่ต้องไม่กลายเป็นย่อหน้าเปล่า (กล่องแชทจะโหว่)', () => {
    const blocks = formatAiReply('บรรทัดแรก\n\n\nบรรทัดสอง');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'para')).toBe(true);
  });

  it('รายการที่ขาดตอนด้วยย่อหน้า → แยกเป็นคนละบล็อก ระยะห่างจะได้ถูก', () => {
    const blocks = formatAiReply('- ก\nสรุป\n- ข');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'para', 'list']);
  });

  it('ตัวหนา **...** ถูกแยกเป็นชิ้น', () => {
    expect(parseSpans('อุณหภูมิ **34.5°C** สูงเกิน')).toEqual([
      { text: 'อุณหภูมิ ', strong: false },
      { text: '34.5°C', strong: true },
      { text: ' สูงเกิน', strong: false },
    ]);
  });

  it('ดาวเดี่ยวที่ไม่ได้จับคู่ ต้องไม่ทำให้ข้อความหาย', () => {
    const spans = parseSpans('ค่า **34 องศา');
    expect(spans.map((sp) => sp.text).join('')).toBe('ค่า **34 องศา');
    expect(spans.every((sp) => !sp.strong)).toBe(true);
  });

  it('คำตอบว่าง → ไม่มีบล็อกเลย (ผู้เรียกจะได้โชว์ข้อความสำรองแทนกล่องเปล่า)', () => {
    expect(formatAiReply('   \n\n  ')).toHaveLength(0);
  });
});
