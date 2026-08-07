/**
 * ชั้นกลาง **ที่เดียว** ที่รู้เรื่อง access_token ของทั้งแอป
 *
 * ⚠️ **ยังไม่ยืนยัน 100% ว่าทีม backend จะส่ง token มาทางไหน**
 * โค้ดนี้จึงรองรับไว้ล่วงหน้า 3 ทาง เพื่อไม่ให้งานค้างรอคำตอบ
 * **พอทีมยืนยันแน่ชัดแล้ว ให้ลบทางที่ไม่ได้ใช้ทิ้ง เหลือไว้ทางเดียวที่ถูกต้อง**
 *
 * ลำดับที่ลองหา (เจอทางไหนก่อนใช้ทางนั้น):
 *   1. `?access_token=` ใน URL — กรณีเปิดจากลิงก์ของระบบหลัก
 *   2. `postMessage` จาก parent — กรณีถูกฝังเป็น iframe (ตรวจ origin ทุกครั้ง)
 *   3. กรอกเองในโหมด dev — สำหรับพัฒนา/เดโม เท่านั้น
 *
 * ไม่เจอทางไหนเลย → แอปใช้ข้อมูลจำลองต่อ ไม่พัง ไม่ค้าง
 *
 * เว็บนี้ **ไม่ทำ login เอง** ไม่เรียก Supabase เอง เป็นแค่ผู้รับ token ที่มาจากที่อื่น
 */

export interface TokenProvider {
  /** token ปัจจุบัน — `null` ถ้ายังไม่มี */
  getToken(): string | null;
  /** รับรู้เมื่อ token เปลี่ยน (มาใหม่ / ถูกแทน / ถูกล้าง) — คืนฟังก์ชันเลิกฟัง */
  onChange(cb: (token: string | null) => void): () => void;
}

/** ที่มาของ token ที่ถืออยู่ — ใช้ดีบักและใช้ตัดสินว่าจะโชว์ช่องกรอกของ dev ไหม */
export type TokenSource = 'none' | 'url' | 'postMessage' | 'manual' | 'supabase';

const URL_PARAM = 'access_token';
const MESSAGE_TYPE = 'AUTH_TOKEN';

let token: string | null = null;
let source: TokenSource = 'none';
const listeners = new Set<(t: string | null) => void>();
let started = false;
let stopListening: (() => void) | null = null;

function publish(next: string | null, from: TokenSource): void {
  if (next === token) return;
  token = next;
  source = next === null ? 'none' : from;
  for (const cb of listeners) cb(next);
}

/**
 * ทางที่ 1 — อ่านจาก query param แล้ว **ลบออกจาก URL ทันที**
 * ถ้าปล่อยค้างไว้ token จะติดไปกับ browser history · bookmark · log ของ proxy
 */
function readFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const found = url.searchParams.get(URL_PARAM);
  if (!found) return;

  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  publish(found, 'url');
}

/**
 * ทางที่ 2 — รับจาก parent frame
 *
 * ⚠️ **ตรวจ `event.origin` ทุกครั้ง** ไม่งั้นเว็บอื่นยัด token ปลอมเข้ามาได้
 * ถ้ายังไม่ได้ตั้ง `VITE_PARENT_ORIGIN` จะ **ไม่รับ** ข้อความใดๆ แล้วเตือนใน console
 * (เลือกทางที่ปลอดภัยกว่า — ยอมไม่ทำงาน ดีกว่ายอมรับจาก origin ที่ตรวจไม่ได้)
 */
function listenToParent(expectedOrigin: string): () => void {
  if (typeof window === 'undefined') return () => undefined;

  /*
   * ไม่ได้ตั้ง origin = ทางนี้ปิด แต่ **ยังต้องฟังต่อ** เพื่อเตือนตอนมีคนส่งมาจริง
   *
   * เดิมเตือนตอนบูตทันที ซึ่งขึ้นทุกครั้งที่เปิดเว็บทั้งที่ทางนี้เป็นทางสำรอง
   * (ทางที่ใช้จริงคือ Supabase) → กลายเป็นเสียงรบกวนที่คนเลิกอ่าน
   * แล้ววันที่มีคำเตือนจริงๆ ก็จะถูกมองข้ามไปด้วย
   * ย้ายมาเตือน ณ จุดที่ **ปฏิเสธของจริง** จึงมีความหมายเสมอเมื่อขึ้น
   */
  if (expectedOrigin === '') {
    const onRefused = (event: MessageEvent): void => {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if ((data as Record<string, unknown>)['type'] !== MESSAGE_TYPE) return;
      console.warn(
        `[tokenProvider] ปฏิเสธ token ที่ส่งมาจาก ${event.origin} เพราะยังไม่ได้ตั้ง ` +
          'VITE_PARENT_ORIGIN (ตรวจ origin ไม่ได้ = ไม่ปลอดภัย) — ' +
          'ถ้า origin นี้ถูกต้อง ให้ใส่ใน .env แล้วรีสตาร์ท dev server',
      );
    };
    window.addEventListener('message', onRefused);
    return () => window.removeEventListener('message', onRefused);
  }

  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== expectedOrigin) return;
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null) return;
    const rec = data as Record<string, unknown>;
    if (rec['type'] !== MESSAGE_TYPE) return;
    const t = rec['token'];
    // parent ส่ง token ใหม่มาแทนตัวเก่าได้ · ส่ง null มาเพื่อล้าง (logout) ก็ได้
    if (typeof t === 'string') publish(t, 'postMessage');
    else if (t === null) publish(null, 'none');
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * เริ่มตรวจจับ token — เรียกครั้งเดียวตอนแอปบูต
 * `parentOrigin` ส่งเข้ามาจาก `config/liveData.ts` ไม่อ่าน env ตรงนี้เอง
 */
export function startTokenProvider(parentOrigin: string): void {
  if (started) return;
  started = true;
  readFromUrl();
  stopListening = listenToParent(parentOrigin);
}

/**
 * ทางที่ 3 — โหมด dev กรอก token เอง
 * ตัวเรียกต้องกันด้วย `import.meta.env.DEV` เอง ฟังก์ชันนี้ไม่รู้จักโหมด
 */
export function setManualToken(next: string | null): void {
  publish(next && next.trim() !== '' ? next.trim() : null, 'manual');
}

/**
 * ทางที่ 4 — ผู้ใช้ login เข้า Supabase เอง (`services/supabaseAuth.ts` เป็นตัวเรียก)
 *
 * ใช้ทางนี้เพราะยังไม่มีระบบอื่นส่ง token มาให้ — ถ้าวันหลังมี ทางที่ 1/2 ก็ยังทำงานได้
 * เพราะทุกทางจบที่ provider ตัวเดียวกันนี้ ไม่มีใครต้องรู้ว่า token มาจากไหน
 */
export function setSupabaseToken(next: string | null): void {
  publish(next, 'supabase');
}

/**
 * ตัวต่ออายุ token — ผู้ที่จ่าย token (Supabase) มาลงทะเบียนไว้
 *
 * ทำไมต้องมี: token ของ Supabase อายุ 60 นาที พอหมดอายุ socket จะโดน backend
 * ปฏิเสธ (`Invalid authentication token`) แล้ว **ค้าง** เพราะ token ใน provider ไม่เปลี่ยน
 * ไม่มีใครสั่งเอาตัวใหม่ → หน้าจอค้างที่ "ขาดการเชื่อมต่อ" ทั้งที่แค่ต่ออายุก็กลับมาได้
 *
 * `useTelemetry` เรียกตัวนี้เมื่อเจอ auth error — provider ไม่รู้จัก Supabase เอง
 * แค่เรียกตัวต่ออายุที่ลงทะเบียนไว้ (แยกความรับผิดชอบ)
 */
let refresher: (() => Promise<boolean>) | null = null;

export function setTokenRefresher(fn: (() => Promise<boolean>) | null): void {
  refresher = fn;
}

/** ขอ token ใหม่ — คืน `true` ถ้าต่ออายุได้ (token ใหม่จะถูก publish ให้ socket ต่อใหม่เอง) */
export async function requestTokenRefresh(): Promise<boolean> {
  if (!refresher) return false;
  try {
    return await refresher();
  } catch {
    return false;
  }
}

export const tokenProvider: TokenProvider = {
  getToken: () => token,
  onChange(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

export const getTokenSource = (): TokenSource => source;

/** ให้เทสล้างสถานะระหว่างเคส — ไม่ใช้ในโค้ดจริง */
export function resetTokenProviderForTest(): void {
  token = null;
  source = 'none';
  listeners.clear();
  started = false;
  stopListening?.();
  stopListening = null;
  refresher = null;
}
