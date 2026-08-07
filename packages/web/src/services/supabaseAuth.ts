import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkAnonKeyShape } from '@/config/anonKeyShape';
import { readSupabaseConfig } from '@/config/liveData';
import { setSupabaseToken, setTokenRefresher } from './tokenProvider';

/**
 * Supabase auth — **แหล่งที่ 4** ที่ป้อน token เข้า `tokenProvider`
 *
 * ใช้เพราะไม่มีระบบอื่นส่ง token มาให้ เว็บจึงต้องให้ผู้ใช้ login เอาเอง
 * ทาง URL / postMessage ยังใช้ได้ต่อ ถ้าวันหลังทีมส่งมาให้จริง —
 * `telemetrySocket` กับ `useTelemetry` ไม่ต้องแก้เลย เพราะคุยกับ provider ไม่ใช่ Supabase ตรงๆ
 *
 * ผู้ใช้แต่ละคนมีบัญชีของตัวเอง (เจ้าของงานเลือกแล้ว) → control log ฝั่ง backend
 * จะรู้ว่าใครสั่งอะไร ไม่ใช่ทุกคนกลายเป็นคนเดียวกัน
 */

/**
 * คีย์ที่ Supabase ใช้เก็บ session ใน localStorage
 *
 * ⚠️ กฎเหล็กข้อ 6 ห้ามใช้ browser storage และมีเทสจับ — เจ้าของงานอนุมัติข้อยกเว้น
 * **เฉพาะ session ของ auth** เพื่อไม่ต้อง login ใหม่ทุกครั้งที่ refresh (ใช้บนแท็บเล็ตทั้งวัน)
 *
 * ตั้งชื่อคีย์เองเพื่อให้ `ironRules.test.tsx` อนุญาตได้แบบเจาะจง
 * ถ้าปล่อยเป็นดีฟอลต์ (`sb-<ref>-auth-token`) ชื่อจะผูกกับ project ref แล้วเทสต้องใช้ pattern กว้าง
 */
export const AUTH_STORAGE_KEY = 'syntech-auth';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = readSupabaseConfig();
  if (!cfg) return null;

  client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      // token หมุนเองไม่ต้องแตะ — ห้าม cache token ไว้เองที่อื่น เดี๋ยวค้างของเก่า
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
      // แอปนี้ไม่มี OAuth redirect flow — ปิดไว้ไม่ให้ไปแตะ URL
      // (URL ถูก `tokenProvider` ใช้อ่าน `?access_token=` อยู่ อย่าให้สองตัวแย่งกัน)
      detectSessionInUrl: false,
    },
  });
  return client;
}

let started = false;
let stopWatching: (() => void) | null = null;

/**
 * เริ่มส่ง token ของ Supabase เข้า `tokenProvider`
 * เรียกครั้งเดียวตอนบูต — เงียบไปเลยถ้ายังไม่ได้ตั้ง env ของ Supabase
 */
export function startSupabaseAuth(): void {
  if (started) return;
  const supabase = getSupabase();
  if (!supabase) return;
  started = true;

  /*
   * เตือนตอนบูตถ้าคีย์รูปร่างผิด — ไม่งั้นอาการจะออกมาเป็น "รหัสผ่านผิด" ซึ่งพาไปไล่หาผิดทาง
   * (เคยเกิดจริง: คีย์ใน `.env` เหลือลายเซ็น 6 ตัวจาก 43 ตัว)
   */
  const shape = checkAnonKeyShape(readSupabaseConfig()?.anonKey ?? '');
  if (shape.message !== null) console.warn(`[supabaseAuth] ${shape.message}`);

  void supabase.auth.getSession().then(({ data }) => {
    setSupabaseToken(data.session?.access_token ?? null);
  });

  // `TOKEN_REFRESHED` ก็มาทางนี้ — token ใหม่จะไปถึง socket ให้ต่อใหม่เองอัตโนมัติ
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    setSupabaseToken(session?.access_token ?? null);
  });
  const unVisible = watchVisibility();
  stopWatching = () => {
    data.subscription.unsubscribe();
    unVisible();
  };

  /*
   * ให้ socket สั่งต่ออายุ token ได้เมื่อโดนปฏิเสธ (`Invalid authentication token`)
   * เป็นตาข่ายชั้นสุดท้าย เผื่อสองชั้นบน (auto-refresh + กลับมาเปิดแท็บ) พลาด
   */
  setTokenRefresher(refreshSupabaseSession);
}

/**
 * ต่ออายุทันทีที่กลับมาเปิดแท็บ ถ้า token ใกล้หมด/หมดแล้ว
 *
 * **ทำไมต้องมี** — `autoRefreshToken` ของ Supabase ตั้งเวลา refresh ไว้ก่อนหมดอายุ
 * แต่ timer นั้น**หยุดตอนแท็บถูกซ่อน/เครื่อง sleep** พอกลับมา token หมดอายุไปแล้ว
 * socket จะโดนปฏิเสธ นี่คือช่องที่หลุดจริง (ผู้ใช้เปิดค้างแล้วสลับไปทำอย่างอื่น)
 *
 * **ไม่ยิงขอ token เป็นลูป** — ยิงถี่ๆ จะโดน rate limit ของ Supabase แล้วล็อกอินไม่ได้เลย
 * ตัวนี้ทำงานตอน "กลับมาเปิดแท็บ" เท่านั้น (event-driven) และต่ออายุเฉพาะตอนใกล้หมดจริง
 */
const REFRESH_MARGIN_SEC = 120;

function watchVisibility(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    void refreshIfStale();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

async function refreshIfStale(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return; // ยังไม่ได้ล็อกอิน — ไม่มีอะไรให้ต่ออายุ
  // `expires_at` เป็น unix วินาที · ใกล้หมด (< 2 นาที) หรือหมดแล้ว ค่อยต่ออายุ
  const secsLeft = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);
  if (secsLeft < REFRESH_MARGIN_SEC) await refreshSupabaseSession();
}

/** token หมดอายุแล้วหรือยัง — อ่าน claim `exp` โดยไม่ตรวจลายเซ็น (แค่เช็กเวลา) */
function isExpired(token: string): boolean {
  const body = token.split('.')[1];
  if (body === undefined) return true;
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') return false;
    // เผื่อ 5 วินาที กันเส้นตาย — ใกล้หมดถือว่าใช้ไม่ได้แล้ว
    return payload.exp * 1000 - Date.now() < 5000;
  } catch {
    return true;
  }
}

/**
 * บังคับต่ออายุ session — คืน `true` ถ้าได้ token ที่ **ยังไม่หมดอายุ**
 *
 * ⚠️ Supabase ของทีมนี้ตั้งค่าพิเศษ (custom token hook) — `refreshSession()` มัก
 * **คืน token เดิม exp เดิม ไม่ต่ออายุจริง** (ยืนยันด้วยการทดสอบ) พอ access token
 * หมดอายุจึงกู้ด้วย refresh ไม่ได้ ต้องล็อกอินใหม่เท่านั้น
 *
 * ดังนั้นถ้าต่ออายุแล้วยังได้ token ที่หมดอายุ → **ล้าง session ทิ้ง** เพื่อให้แอปกลับไป
 * สถานะ "ล็อกอินเพื่อดูข้อมูลจริง" (มีปุ่มให้กด) แทนค้างที่ "Invalid authentication token"
 */
async function refreshSupabaseSession(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (error || !token || isExpired(token)) {
    // กู้ไม่ได้จริง — ล้าง session ให้แอปพากลับไปหน้า "ล็อกอินใหม่" อย่างสะอาด
    await supabase.auth.signOut();
    setSupabaseToken(null);
    return false;
  }
  setSupabaseToken(token);
  return true;
}

/** คืนข้อความ error ถ้า login ไม่ผ่าน · คืน `null` ถ้าผ่าน */
export async function signIn(email: string, password: string): Promise<string | null> {
  const cfg = readSupabaseConfig();
  const supabase = getSupabase();
  if (!cfg || !supabase) return 'ยังไม่ได้ตั้งค่า Supabase';

  /*
   * คีย์รูปร่างผิด = ยิงไปก็ได้ `Invalid authentication credentials` ซึ่งอ่านเหมือนรหัสผ่านผิด
   * บอกสาเหตุจริงตรงนี้เลย ดีกว่าให้ไปนั่งเปลี่ยนรหัสผ่านหาเรื่อยๆ
   */
  const shape = checkAnonKeyShape(cfg.anonKey);
  if (shape.message !== null) return shape.message;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

/** ให้เทสล้างสถานะ — ไม่ใช้ในโค้ดจริง */
export function resetSupabaseAuthForTest(): void {
  client = null;
  started = false;
  stopWatching?.();
  stopWatching = null;
  setTokenRefresher(null);
}
