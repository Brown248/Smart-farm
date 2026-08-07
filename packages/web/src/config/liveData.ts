/**
 * ประตูเดียวที่อ่าน env ของการต่อข้อมูลจริง
 *
 * แอปต้องเปิดได้เสมอแม้ยังไม่ได้ตั้งค่า — ถ้าค่าจำเป็นตัวใดตัวหนึ่งว่าง
 * ให้ถือว่า "ยังต่อจริงไม่ได้" แล้วใช้ข้อมูลจำลองต่อไป
 * (`data/mockClimate.ts` · `data/mockSensorHistory.ts` — **ห้ามลบ**)
 *
 * เหตุที่รวมมาอ่านที่เดียว: ถ้าปล่อยให้แต่ละหน้าอ่าน `import.meta.env` เอง
 * จะกลับไปเป็นปัญหาเดิมของโปรเจกต์นี้ — ค่าเดียวกันถูกตีความไม่เหมือนกันตามหน้าที่เปิดอยู่
 *
 * token มาได้ 4 ทาง — ดู `services/tokenProvider.ts`
 * (URL · postMessage · กรอกเองโหมด dev · Supabase ที่ผู้ใช้ล็อกอินเอง)
 */
export interface LiveDataConfig {
  /** origin ของ backend ทีม (ตัด `/` ท้ายออกแล้ว) — **ไม่รวม** namespace `/telemetry` */
  readonly wsUrl: string;
  /** อุปกรณ์/องค์กรที่จะ subscribe — โรงเรือน A1 */
  readonly deviceId: string;
  readonly orgId: string;
}

/** env ที่ต้องมีครบถึงจะต่อจริงได้ */
export const LIVE_ENV_KEYS = ['VITE_WS_URL', 'VITE_FARM_DEVICE_ID', 'VITE_FARM_ORG_ID'] as const;

export type LiveEnvKey = (typeof LIVE_ENV_KEYS)[number];

const read = (key: string): string => (import.meta.env[key as keyof ImportMetaEnv] ?? '').trim();

/** env ที่ยังไม่ได้ตั้ง — เอาไปบอกได้ว่าขาดอะไร ไม่ใช่เงียบๆ ใช้ของปลอม */
export function missingLiveEnv(): readonly LiveEnvKey[] {
  return LIVE_ENV_KEYS.filter((k) => read(k) === '');
}

/** คืน `null` = ยังต่อจริงไม่ได้ ให้ใช้ข้อมูลจำลอง */
export function readLiveDataConfig(): LiveDataConfig | null {
  if (missingLiveEnv().length > 0) return null;
  return {
    // ตัด `/` ท้ายและ `/telemetry` ที่อาจถูกใส่มาเกิน — namespace ต่อในโค้ดเท่านั้น
    wsUrl: read('VITE_WS_URL')
      .replace(/\/+$/, '')
      .replace(/\/telemetry$/, ''),
    deviceId: read('VITE_FARM_DEVICE_ID'),
    orgId: read('VITE_FARM_ORG_ID'),
  };
}

/**
 * REST base ของ backend ทีม (ส่งคำสั่งจริง POST attributes) · คืน `null` เมื่อยังต่อจริงไม่ได้
 *
 * ยิงผ่าน **reverse-proxy path เดียวกัน `/hs-proxy` ทั้ง dev และ prod** = same-origin → **เลี่ยง CORS**
 *   - dev  (`npm run dev`): Vite proxy `/hs-proxy` → backend (ดู `vite.config.ts`)
 *   - prod (Docker): nginx proxy `/hs-proxy` → backend (ดู `Dockerfile` · `deploy/nginx.conf.template`)
 * ทุก endpoint ใช้ `Authorization: Bearer <token>` ตัวเดียวกับที่ socket ใช้ (จาก tokenProvider)
 */
export function apiBaseUrl(): string | null {
  const cfg = readLiveDataConfig();
  if (cfg === null) return null;
  return '/hs-proxy/api/v1';
}

/**
 * origin ของเว็บหลักที่ยอมรับ `postMessage` จาก — **ยังไม่ทราบค่าจริง**
 * ค่าว่าง = ไม่รับ postMessage เลย (ตรวจ origin ไม่ได้ = ไม่ปลอดภัย) `tokenProvider` จะเตือนให้
 */
export const parentOrigin = (): string => read('VITE_PARENT_ORIGIN');

/**
 * พิกัดฟาร์ม (ละติจูด/ลองจิจูด) — ใช้ดึงพยากรณ์อากาศจริงจาก Open-Meteo
 *
 * ดีฟอลต์เป็นกรุงเทพฯ เพราะยังไม่รู้พิกัดจริงของโรงเรือน A1 (ตั้ง `VITE_FARM_LAT`/`_LON`
 * ทับได้เมื่อรู้พิกัดจริง) — อากาศคลาดเคลื่อนได้บ้างถ้าฟาร์มอยู่คนละภาค แต่ยังเป็น "เวลาไทย"
 */
export interface FarmLocation {
  readonly lat: number;
  readonly lon: number;
}

export function farmLocation(): FarmLocation {
  const lat = Number(read('VITE_FARM_LAT'));
  const lon = Number(read('VITE_FARM_LON'));
  const ok = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  // กรุงเทพฯ เป็นค่าตั้งต้น
  return ok ? { lat, lon } : { lat: 13.7563, lon: 100.5018 };
}

/**
 * Supabase — ใช้ให้ผู้ใช้ login เอาเอง เพราะไม่มีระบบอื่นส่ง token มาให้
 *
 * **แยก gate จาก WS โดยตั้งใจ** — ตั้ง Supabase แล้วแต่ยังไม่ตั้ง WS (หรือกลับกัน) เป็นไปได้
 * ถ้ารวมเป็น gate เดียวจะแยกไม่ออกว่าขาดอะไร แล้วไล่หาสาเหตุยาก
 */
export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export const SUPABASE_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

export function readSupabaseConfig(): SupabaseConfig | null {
  const url = read('VITE_SUPABASE_URL');
  const anonKey = read('VITE_SUPABASE_ANON_KEY');
  if (url === '' || anonKey === '') return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export const isAuthConfigured = (): boolean => readSupabaseConfig() !== null;

/** ต่อของจริงได้แล้วหรือยัง — ใช้สลับ mock/live */
export const isLiveConfigured = (): boolean => readLiveDataConfig() !== null;
