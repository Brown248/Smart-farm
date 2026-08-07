/**
 * ตรวจรูปร่างของ Supabase anon key — จับกรณี "คีย์ขาด" ให้เห็นตั้งแต่ตอนบูต
 *
 * **ทำไมต้องมี:** คีย์ที่ลายเซ็นขาดกับรหัสผ่านผิด ทำให้ Supabase ตอบข้อความเดียวกัน
 * (`Invalid authentication credentials`) → ไล่หาสาเหตุผิดทางได้ทั้งวัน
 * เคยเกิดจริง: คีย์ใน `.env` เหลือลายเซ็น 6 ตัวจาก 43 ตัว ล็อกอินไม่ผ่านทุกครั้ง
 * ทั้งที่ URL · รหัสผ่าน · โค้ดถูกหมด
 *
 * **ไม่ตรวจว่าลายเซ็นถูกต้อง** — ทำได้ต้องมี JWT secret ซึ่งอยู่ฝั่ง server เท่านั้น
 * ที่นี่ตรวจแค่ "รูปร่างเป็นไปได้ไหม" ซึ่งพอจับกรณีคัดลอกมาไม่ครบได้แล้ว
 */

/** ลายเซ็น HS256 ที่เข้ารหัส base64url ยาว 43 ตัวเสมอ — สั้นกว่านี้มากคือคีย์ขาด */
const HS256_SIGNATURE_LENGTH = 43;

/**
 * เผื่อไว้กว้างกว่าความจริง เพื่อไม่เตือนผิดกรณีใช้อัลกอริทึมอื่น (ES256 = 86 ตัว)
 * เตือนเฉพาะที่สั้นจนเป็นไปไม่ได้ในทุกอัลกอริทึม
 */
const MIN_PLAUSIBLE_SIGNATURE = 20;

export type AnonKeyProblem = 'truncated-signature' | 'not-three-parts' | 'unreadable-payload';

export interface AnonKeyCheck {
  readonly problem: AnonKeyProblem | null;
  /** ข้อความพร้อมแสดง — `null` เมื่อไม่มีปัญหา */
  readonly message: string | null;
}

const OK: AnonKeyCheck = { problem: null, message: null };

/**
 * `key` ดูเหมือน JWT ไหม — คีย์รูปแบบใหม่ของ Supabase (`sb_publishable_…`) ไม่ใช่ JWT
 * และไม่ควรถูกเตือน จึงตรวจเฉพาะตัวที่ขึ้นต้นแบบ JWT (`eyJ` = `{"` ที่เข้ารหัสแล้ว)
 */
const looksLikeJwt = (key: string): boolean => key.startsWith('eyJ');

export function checkAnonKeyShape(key: string): AnonKeyCheck {
  const k = key.trim();
  if (k === '' || !looksLikeJwt(k)) return OK;

  const parts = k.split('.');
  if (parts.length !== 3) {
    return {
      problem: 'not-three-parts',
      message:
        `VITE_SUPABASE_ANON_KEY ขึ้นต้นแบบ JWT แต่มี ${parts.length} ส่วน (ต้องเป็น 3 ส่วนคั่นด้วยจุด) — ` +
        `น่าจะคัดลอกมาไม่ครบ`,
    };
  }

  const [, payload, signature] = parts as [string, string, string];

  try {
    JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {
      problem: 'unreadable-payload',
      message: 'VITE_SUPABASE_ANON_KEY อ่านส่วนกลางไม่ออก — คีย์เสียหรือคัดลอกมาไม่ครบ',
    };
  }

  if (signature.length < MIN_PLAUSIBLE_SIGNATURE) {
    return {
      problem: 'truncated-signature',
      message:
        `VITE_SUPABASE_ANON_KEY ลายเซ็นสั้นผิดปกติ (${signature.length} ตัว ปกติ ${HS256_SIGNATURE_LENGTH} ตัว) — ` +
        `คีย์ถูกตัดปลาย ล็อกอินจะไม่ผ่านทุกครั้งโดยขึ้นข้อความเหมือนรหัสผ่านผิด ` +
        `ให้คัดลอกคีย์เต็มจาก Supabase → Project Settings → API มาใส่ใหม่`,
    };
  }

  return OK;
}
