import { setSupabaseToken, setTokenRefresher } from '@/services/tokenProvider';

/**
 * ขอ token เองโดยไม่ต้องให้ผู้ใช้ล็อกอิน — โหมดใช้งานในวง LAN
 *
 * เจ้าของงานตัดสิน 2026-08-11: เว็บอยู่ในวง LAN บริษัทเท่านั้น ไม่เปิดออกอินเทอร์เน็ต
 * จึงไม่ต้องมีหน้าล็อกอิน · แท็บเล็ตติดผนังเปิดค้างได้ตลอดโดยไม่เด้งออกทุกชั่วโมง
 *
 * 🔴 **รหัสผ่านไม่เคยมาถึงเบราว์เซอร์** — nginx เป็นคนใส่ให้ตอน proxy ไป Supabase
 * (`location = /auth/token` ใน `deploy/nginx.conf.template`) หน้าเว็บได้กลับมาแค่
 * `access_token` ซึ่งเดิมก็ได้อยู่แล้วตอนผู้ใช้ล็อกอินเอง — ไม่ได้เปิดอะไรใหม่ให้เบราว์เซอร์
 *
 * ⚠️ ใครเข้าถึงเว็บนี้ได้ = ขอ token ได้ = สั่งอุปกรณ์ได้
 * **ถ้าวันหลังเปิดออกอินเทอร์เน็ต ต้องปิด endpoint นี้ที่ nginx ก่อน**
 *
 * ไม่ได้ตั้ง `FARM_USER` บนเซิร์ฟเวอร์ → nginx คืน 404 → ตัวนี้เงียบ
 * แล้วแอปถอยไปใช้หน้าล็อกอินตามปกติ (ไม่พังและไม่ขึ้น error ให้ผู้ใช้งง)
 */

/** endpoint ที่ nginx เปิดให้ — same-origin จึงไม่ติด CORS และไม่ต้องแตะ CSP */
const AUTO_AUTH_URL = '/auth/token';

/** ขอใหม่ก่อนหมดอายุเท่านี้ — เผื่อเวลาให้ socket ต่อใหม่ทันก่อน token เดิมตาย */
const RENEW_MARGIN_MS = 3 * 60 * 1000;

/**
 * กันยิงรัวตอนเซิร์ฟเวอร์มีปัญหา — Supabase มี rate limit ถ้าโดนจะล็อกอินไม่ได้เลยทั้งระบบ
 * ถอยเป็นขั้น: 30 วิ → 1 นาที → 2 → 4 → สูงสุด 5 นาที
 */
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60 * 1000;

let timer: number | null = null;
/** โหมดนี้ทำงานอยู่จริงไหม — UI ใช้ตัดสินว่าจะโชว์ปุ่มเข้าสู่ระบบหรือไม่ */
let active = false;
const listeners = new Set<(on: boolean) => void>();
function setActive(on: boolean): void {
  if (active === on) return;
  active = on;
  for (const fn of listeners) fn(on);
}

/** โหมดขอ token เองทำงานอยู่ไหม (เซิร์ฟเวอร์เปิดไว้ + ขอสำเร็จแล้ว) */
export const isAutoAuthActive = (): boolean => active;

/** รับรู้เมื่อสถานะเปลี่ยน — คืนฟังก์ชันเลิกฟัง */
export function onAutoAuthChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let failures = 0;
let started = false;

/** อ่าน `exp` จาก JWT โดยไม่ตรวจลายเซ็น (แค่ดูเวลา) — คืน ms epoch หรือ `null` ถ้าอ่านไม่ได้ */
function expiryMs(token: string): number | null {
  const body = token.split('.')[1];
  if (body === undefined) return null;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function clearTimer(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

/**
 * ขอ token หนึ่งครั้ง — คืน `true` ถ้าได้ token ใหม่
 *
 * ตั้งเวลาขอรอบถัดไปให้เองเสมอ (สำเร็จ = ก่อนหมดอายุ · ล้มเหลว = ถอยเป็นขั้น)
 * ทำให้แท็บที่เปิดค้างได้ token ใหม่ตลอดโดยไม่ต้องมีใครกดอะไร
 */
export async function fetchAutoToken(): Promise<boolean> {
  clearTimer();
  try {
    const res = await fetch(AUTO_AUTH_URL, { method: 'POST' });
    // 404 = เซิร์ฟเวอร์ไม่ได้เปิดโหมดนี้ (ไม่ได้ตั้ง FARM_USER) → เลิกพยายาม ปล่อยให้ล็อกอินเอง
    if (res.status === 404) {
      setActive(false);
      return false;
    }
    if (!res.ok) throw new Error(`auto-auth ${res.status}`);

    const data = (await res.json()) as { access_token?: unknown };
    const token = typeof data.access_token === 'string' ? data.access_token : null;
    if (token === null) throw new Error('auto-auth: ไม่มี access_token ในคำตอบ');

    failures = 0;
    setActive(true);
    setSupabaseToken(token);

    /*
     * อ่านอายุจริงจาก token ไม่ใช่สมมติเอาว่า 60 นาที
     * ถ้าวันหลังทีม backend เพิ่ม/ลด JWT expiry ตัวนี้ตามเองโดยไม่ต้องแก้โค้ด
     */
    const exp = expiryMs(token);
    const wait =
      exp === null ? 30 * 60 * 1000 : Math.max(60_000, exp - Date.now() - RENEW_MARGIN_MS);
    timer = window.setTimeout(() => void fetchAutoToken(), wait);
    return true;
  } catch {
    failures += 1;
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1));
    timer = window.setTimeout(() => void fetchAutoToken(), wait);
    return false;
  }
}

/**
 * เริ่มโหมดขอ token เอง — เรียกครั้งเดียวตอนแอปเริ่ม
 *
 * คืน `true` ถ้าเซิร์ฟเวอร์เปิดโหมดนี้ไว้จริง (หน้าเว็บจะได้ซ่อนปุ่มล็อกอิน)
 * ต่อ `setTokenRefresher` ด้วย เพื่อให้ socket ที่โดนปฏิเสธสั่งขอใหม่ได้ทันที
 */
export async function startAutoAuth(): Promise<boolean> {
  if (started) return true;
  started = true;
  const ok = await fetchAutoToken();
  if (ok) setTokenRefresher(fetchAutoToken);
  else started = false;
  return ok;
}

/** ให้เทสล้างสถานะระหว่างเคส — ไม่ใช้ในโค้ดจริง */
export function resetAutoAuthForTest(): void {
  clearTimer();
  failures = 0;
  started = false;
  active = false;
  listeners.clear();
}
