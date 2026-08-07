import { describe, expect, it } from 'vitest';
import { checkAnonKeyShape } from './anonKeyShape';

/**
 * คีย์ที่คัดลอกมาไม่ครบต้องบอกได้ว่า "คีย์ขาด" ไม่ใช่ปล่อยให้อาการออกมาเป็น "รหัสผ่านผิด"
 *
 * เกิดจริงมาแล้ว: `VITE_SUPABASE_ANON_KEY` ใน `.env` เหลือลายเซ็น 6 ตัวจาก 43 ตัว
 * Supabase ตอบ `Invalid authentication credentials` เหมือนกรอกรหัสผ่านผิดเป๊ะ
 * → ไล่หาสาเหตุผิดทางได้ทั้งวันทั้งที่ URL · รหัสผ่าน · โค้ดถูกหมด
 */
const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const payload = 'eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0';
const sig43 = 'a'.repeat(43);

describe('checkAnonKeyShape', () => {
  it('คีย์เต็มรูปแบบผ่าน', () => {
    expect(checkAnonKeyShape(`${header}.${payload}.${sig43}`).problem).toBeNull();
  });

  it('ลายเซ็นขาด → บอกว่าคีย์ถูกตัดปลาย พร้อมความยาวที่เจอกับที่ควรเป็น', () => {
    const r = checkAnonKeyShape(`${header}.${payload}.Pjgsj-`);

    expect(r.problem).toBe('truncated-signature');
    expect(r.message).toContain('6');
    expect(r.message).toContain('43');
  });

  it('ไม่ครบ 3 ส่วน → บอกว่าคัดลอกมาไม่ครบ', () => {
    expect(checkAnonKeyShape(`${header}.${payload}`).problem).toBe('not-three-parts');
  });

  it('ส่วนกลางอ่านไม่ออก → บอกว่าคีย์เสีย', () => {
    expect(checkAnonKeyShape(`${header}.!!!not-base64!!!.${sig43}`).problem).toBe(
      'unreadable-payload',
    );
  });

  it('ค่าว่างไม่เตือน — "ยังไม่ได้ตั้งค่า" เป็นสถานะปกติ มี gate อื่นดูแลอยู่แล้ว', () => {
    expect(checkAnonKeyShape('').problem).toBeNull();
    expect(checkAnonKeyShape('   ').problem).toBeNull();
  });

  /** คีย์รูปแบบใหม่ของ Supabase ไม่ใช่ JWT — เตือนไปจะเป็น false positive */
  it('คีย์ที่ไม่ใช่ JWT ไม่เตือน (เช่น sb_publishable_…)', () => {
    expect(checkAnonKeyShape('sb_publishable_AbCdEf123456').problem).toBeNull();
  });

  it('ตัดช่องว่างหัวท้ายก่อนตรวจ — ขึ้นบรรทัดใหม่ใน .env ไม่ควรทำให้เตือนผิด', () => {
    expect(checkAnonKeyShape(`  ${header}.${payload}.${sig43}  `).problem).toBeNull();
  });
});
