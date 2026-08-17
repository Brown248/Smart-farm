import { CLIMATE_KEYS, type ClimateKey } from '@shared/sensor';
import { telemetryNumber, type TelemetryValue } from '@shared/telemetrySocket';
import { CLIMATE_RANGE } from '@shared/thresholds';

/**
 * จับคู่ชื่อ key ที่ device ยิงมา → ค่าที่หน้าจอใช้
 *
 * **ทำไมต้องจับคู่ ไม่ใช่เดาชื่อไปขอ**
 * `WEBSOCKET_API.md` เตือนว่า "ถ้า key ผิด ThingsBoard จะไม่ error แต่จะไม่มี event ส่งมาเลย (เงียบ)"
 * → เดาชื่อไปขอแล้วผิด = จอว่าง แยกไม่ออกจาก device offline
 *
 * เอกสารบอกว่า "ไม่ส่ง `keys` มา = รับทุก key ที่ device ยิงมา" — **ทดสอบแล้วไม่จริง**
 * (ดู `TELEMETRY_KEYS` ข้างล่าง) ต้องส่งชื่อจริงไปเสมอ
 *
 * ตาราง alias ยังมีอยู่และยังทำงาน: เราส่งชื่อจริงไปขอ แล้วจับคู่จากชื่อที่ไหลกลับมา
 * ถ้าวันหลังอุปกรณ์เปลี่ยนชื่อ key แล้วเราเติมเข้า `TELEMETRY_KEYS` ตาราง alias จะจับคู่ให้เอง
 * ที่จับไม่ได้จะโผล่ใน `unmatchedKeys()` ให้เห็นทันทีว่ามีชื่ออะไรมาแทน
 */

export interface ClimateKeyRule {
  /** ชื่อที่ยอมรับ เรียงตามลำดับความมั่นใจ — เทียบแบบไม่สนตัวพิมพ์และตัวคั่น */
  readonly aliases: readonly string[];
  /**
   * ตัวคูณแปลงหน่วย — ค่าเริ่มต้น 1
   * ตั้งเมื่อรู้แล้วว่า device ส่งมาหน่วยอื่น (เช่น lux ดิบ → k lux ใช้ 0.001)
   */
  readonly scale?: number;
}

/**
 * ตัวอย่างในเอกสารใช้ `brightness` กับ `temperature` — ใส่ทั้งสองแบบและชื่อที่พบบ่อยไว้
 * เห็นชื่อจริงแล้วให้ตัดที่ไม่ใช่ออก เหลือชื่อเดียวต่อค่า จะได้ไม่จับผิดตัว
 */
export const CLIMATE_KEY_RULES: Readonly<Record<ClimateKey, ClimateKeyRule>> = {
  temp: { aliases: ['temperature', 'temp', 'air_temperature', 'airTemp'] },
  rh: { aliases: ['humidity', 'hum', 'rh', 'air_humidity', 'airHumidity'] },
  lux: { aliases: ['brightness', 'lux', 'light', 'illuminance', 'light_intensity'] },
};

/** ความชื้นดิน — ถ้ามีตัวเดียวใช้กับทุกแปลง (ยังไม่ยืนยันว่ามี 1 หรือ 8 ตัว) */
export const SOIL_ALIASES: readonly string[] = [
  'soil',
  'soil_moisture',
  'soilMoisture',
  'moisture',
  'soil_humidity',
];

/**
 * 🔴 รายชื่อ key ที่ **ต้องส่งไปกับ `subscribe_telemetry`** ไม่งั้นไม่ได้ค่าอะไรเลย
 *
 * **`WEBSOCKET_API.md` เขียนว่า "ไม่ส่ง `keys` = รับทุก key ที่ device ยิงมา" — ของจริงไม่ใช่**
 * ทดสอบกับ backend จริง 2026-08-17: ไม่ส่ง `keys` → ฟัง 90 วินาที ได้ `telemetry_data` **0 ครั้ง**
 * (ขณะที่ `attribute_data` มาทุก 10 วินาทีปกติ) · ส่ง `keys` → ได้ค่าทันทีใน 1 วินาที
 * นี่คือสาเหตุที่ header ค้างอยู่ที่ "ต่อติดแล้ว รอค่า…" ตลอด
 *
 * ⚠️ **ต้องเป็นชื่อจริงเท่านั้น ห้ามยัด alias ทั้งชุดลงมา**
 * backend ตอบกลับ **ทุก key ที่ขอ** — ตัวที่อุปกรณ์ไม่มีจะได้ `value: null` พร้อม timestamp สดๆ
 * ถ้าใส่ alias ครบชุด `pickKey` จะไปเจอ `brightness`/`soil` (null) ก่อน `light`/`soil_moisture`
 * แล้วค่าหายทั้งสองตัว — ทดสอบแล้วพังจริง 2 ใน 4 ค่า
 *
 * ชื่อทั้งหมดนี้ยืนยันจากหน้า Latest telemetry ของ ThingsBoard (device `handysense-farm`)
 * ตาราง alias ข้างบนยังอยู่เพื่อรองรับกรณีอุปกรณ์เปลี่ยนชื่อ key — จับคู่ตอนค่าไหลเข้ามา
 */
export const TELEMETRY_KEYS: readonly string[] = [
  // ── ค่าที่หน้าจอแสดง ──
  'temperature',
  'humidity',
  'light',
  'soil_moisture',
  // ── ไม่ใช่ค่าเซนเซอร์ แต่ขาดไม่ได้ ──
  'cmd_result', // ผลตอบกลับคำสั่งจริง — ขาดตัวนี้ = สั่งอุปกรณ์แล้วไม่มีวันรู้ผล
  'netpie_banned', // อุปกรณ์ถูกระงับ → ต้องกันปุ่ม ไม่งั้นกดแล้วระบบตอบ ok ทั้งที่ไม่ถึงอุปกรณ์
  'netpie_enabled',
  'netpie_status',
];

/**
 * ค่าทั้งหมดที่หน้าจอต้องใช้ — เอาไปคิดสัดส่วน "ของจริงกี่ค่าจากกี่ค่า"
 * ความชื้นดินนับเป็น 1 ค่าเพราะยังไม่ยืนยันว่ามีเซนเซอร์แยกแปลงหรือตัวเดียวทั้งโรงเรือน
 */
export const LIVE_FIELDS = [...CLIMATE_KEYS, 'soil'] as const;
export type LiveField = (typeof LIVE_FIELDS)[number];

/** ตัดตัวคั่นและตัวพิมพ์ออกก่อนเทียบ — `soil_moisture` · `soilMoisture` · `SOIL-MOISTURE` ถือว่าเหมือนกัน */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * หา key จริงตัวแรกที่ตรงกับ alias — คืน `null` ถ้าไม่มีเลย
 *
 * `hasValue` ให้ผู้เรียกกรอง key ที่ "มีชื่อแต่ไม่มีค่า" ทิ้งแล้วไล่ alias ตัวถัดไปต่อ
 * จำเป็นเพราะ backend ตอบกลับทุก key ที่ขอ ตัวที่อุปกรณ์ไม่มีจะได้ `value: null`
 * ถ้าเจอชื่อแล้วหยุดเลย ค่าจะหายทั้งที่มี alias ตัวอื่นที่มีค่าจริงรออยู่
 */
export function pickKey(
  available: readonly string[],
  aliases: readonly string[],
  hasValue?: (key: string) => boolean,
): string | null {
  const table = new Map(available.map((k) => [norm(k), k]));
  for (const a of aliases) {
    const hit = table.get(norm(a));
    if (hit !== undefined && (hasValue === undefined || hasValue(hit))) return hit;
  }
  return null;
}

/**
 * ค่าที่หลุดช่วงของ gauge มากๆ มักเป็นเรื่องหน่วย ไม่ใช่เซนเซอร์เพี้ยน
 * (เช่น lux ดิบ 24600 ขณะที่หน้าจอใช้ k lux ช่วง 0–55)
 *
 * แจ้งเตือนครั้งเดียวต่อค่า **ไม่แปลงให้เอง** — แปลงเงียบๆ คือเดาแทนผู้ใช้
 * เห็นเตือนแล้วให้ไปใส่ `scale` ใน `CLIMATE_KEY_RULES` ให้ตรงหน่วยจริง
 */
const warned = new Set<ClimateKey>();
function warnIfOutOfRange(key: ClimateKey, value: number): void {
  if (warned.has(key)) return;
  const r = CLIMATE_RANGE[key];
  if (value > r.max * 5 || (value < r.min / 5 && value !== 0)) {
    warned.add(key);
    console.warn(
      `[telemetryKeys] ค่า "${key}" ที่ได้มา (${value}) หลุดช่วงของหน้าจอ (${r.min}–${r.max}) ` +
        `น่าจะเป็นเรื่องหน่วย — ใส่ \`scale\` ใน CLIMATE_KEY_RULES.${key} ให้ตรงหน่วยของ device`,
    );
  }
}

export interface ResolvedClimate {
  /** ค่าที่จับคู่ได้จริง — key ที่ไม่มีข้อมูลจะไม่มีใน object นี้ */
  readonly values: Partial<Record<ClimateKey, number>>;
  /** ชื่อ key จริงที่ใช้ของแต่ละค่า — เอาไปแสดง/ดีบักได้ */
  readonly matched: Partial<Record<ClimateKey, string>>;
}

/** แปลงข้อมูลสดที่ได้จาก socket → ค่าอากาศที่หน้าจอใช้ */
export function resolveClimate(live: Readonly<Record<string, TelemetryValue>>): ResolvedClimate {
  const available = Object.keys(live);
  const values: Partial<Record<ClimateKey, number>> = {};
  const matched: Partial<Record<ClimateKey, string>> = {};

  const numeric = (k: string) => telemetryNumber(live[k]?.value) !== null;

  for (const key of CLIMATE_KEYS) {
    const rule = CLIMATE_KEY_RULES[key];
    // ข้าม alias ที่ backend ตอบมาแต่ไม่มีค่า (`value: null`) แล้วไล่ตัวถัดไปต่อ
    const realKey = pickKey(available, rule.aliases, numeric);
    if (realKey === null) continue;
    const n = telemetryNumber(live[realKey]?.value);
    if (n === null) continue;
    const scaled = n * (rule.scale ?? 1);
    warnIfOutOfRange(key, scaled);
    values[key] = scaled;
    matched[key] = realKey;
  }

  return { values, matched };
}

/** ความชื้นดินจากข้อมูลสด — `null` ถ้าไม่มี key ที่ตรง */
export function resolveSoil(live: Readonly<Record<string, TelemetryValue>>): number | null {
  const realKey = soilKey(live);
  return realKey === null ? null : telemetryNumber(live[realKey]?.value);
}

/** ชื่อ key จริงของความชื้นดิน — แยกออกมาเพื่อเอาไปแสดงว่าจับคู่กับตัวไหน */
export function soilKey(live: Readonly<Record<string, TelemetryValue>>): string | null {
  return pickKey(Object.keys(live), SOIL_ALIASES, (k) => telemetryNumber(live[k]?.value) !== null);
}

/**
 * key ที่ device ส่งมา "ซึ่งเราจับคู่/ใช้แล้ว" — ไม่ต้องขึ้นในรายการ unmatched
 * `cmd_result` ใช้ผ่าน `readCommandResult` แล้ว จึงไม่ใช่ค่าที่ยังไม่รู้จัก
 */
const CONSUMED_KEYS: readonly string[] = [
  'cmd_result',
  // สถานะ NETPIE — อ่านผ่าน `netpie` ใน provider แล้ว ไม่ใช่ key ที่ยังไม่รู้จัก
  'netpie_banned',
  'netpie_enabled',
  'netpie_status',
];

/** key ที่ device ส่งมาแต่เรายังไม่รู้จัก — เอาไปบอกได้ว่ามีอะไรให้ใช้เพิ่ม */
export function unmatchedKeys(live: Readonly<Record<string, TelemetryValue>>): readonly string[] {
  const known = new Set<string>(CONSUMED_KEYS);
  const available = Object.keys(live);
  for (const key of CLIMATE_KEYS) {
    const k = pickKey(available, CLIMATE_KEY_RULES[key].aliases);
    if (k !== null) known.add(k);
  }
  const soil = soilKey(live);
  if (soil !== null) known.add(soil);
  return available.filter((k) => !known.has(k));
}
