import type { ZoneId } from '@shared/zone';
import type { CropIconName, IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

/** ระดับสถานะบนหน้าข้อมูล — คนละสเกลกับ ZoneStatus ของฉากเกม */
export type DashLevel = 'normal' | 'warn' | 'crit';

export const DASH_COLOR: Readonly<Record<DashLevel, string>> = {
  normal: 'var(--d-ok)',
  warn: 'var(--d-warn)',
  crit: 'var(--d-crit)',
};

export const DASH_BG: Readonly<Record<DashLevel, string>> = {
  normal: 'var(--d-ok-bg)',
  warn: 'var(--d-warn-bg)',
  crit: 'var(--d-crit-bg)',
};

/* ───────────────────────── โซน A–H ───────────────────────── */

/**
 * โซนบนแดชบอร์ดใช้ตัวอักษร A–H ส่วนฉากเกมใช้ชื่อพืชเป็น id
 * ตารางนี้คือสะพานเชื่อมสองหน้าเข้าด้วยกัน — พืชชุดเดียวกันทั้งคู่
 */
export interface DashZone {
  readonly letter: string;
  readonly zoneId: ZoneId;
  readonly cropIcon: CropIconName;
  readonly cropKey: TextKey;
  readonly moisture: number;
  readonly level: DashLevel;
}

export const DASH_ZONES: readonly DashZone[] = [
  {
    letter: 'A',
    zoneId: 'kale',
    cropIcon: 'kale',
    cropKey: 'crop_kale',
    moisture: 48,
    level: 'normal',
  },
  {
    letter: 'B',
    zoneId: 'flower',
    cropIcon: 'flowers',
    cropKey: 'crop_flowers',
    moisture: 24,
    level: 'warn',
  },
  {
    letter: 'C',
    zoneId: 'rosemary',
    cropIcon: 'rosemary',
    cropKey: 'crop_rosemary',
    moisture: 34,
    level: 'normal',
  },
  {
    letter: 'D',
    zoneId: 'mushroom',
    cropIcon: 'mushroom',
    cropKey: 'crop_mushroom',
    moisture: 78,
    level: 'normal',
  },
  {
    letter: 'E',
    zoneId: 'lettuce',
    cropIcon: 'salad',
    cropKey: 'crop_salad',
    moisture: 52,
    level: 'normal',
  },
  {
    letter: 'F',
    zoneId: 'cucumber',
    cropIcon: 'cucumber',
    cropKey: 'crop_cucumber',
    moisture: 58,
    level: 'normal',
  },
  {
    letter: 'G',
    zoneId: 'strawberry',
    cropIcon: 'strawberry',
    cropKey: 'crop_strawberry',
    moisture: 35,
    level: 'crit',
  },
  {
    letter: 'H',
    zoneId: 'tomato',
    cropIcon: 'tomato',
    cropKey: 'crop_tomato',
    moisture: 45,
    level: 'normal',
  },
];

/* ───────────────────────── ภาพรวมฟาร์ม ───────────────────────── */

/** สีจุดสถานะย่อในการ์ดภาพรวม (คนละชุดกับสถานะหลัก — โทนอ่อนบนพื้นเขียวเข้ม) */
export const HERO_DOT_COLOR = {
  normal: '#7cc79a',
  warn: '#e6b45a',
  dry: '#e08a72',
} as const;

export type HeroDotKind = keyof typeof HERO_DOT_COLOR;

/** สภาพดินของแต่ละแปลงตามสเกลจุดในการ์ดภาพรวม */
const DOT_OF_LEVEL: Readonly<Record<DashLevel, HeroDotKind>> = {
  normal: 'normal',
  warn: 'warn',
  crit: 'dry',
};

/**
 * จุดสถานะ 8 แปลง — ต้นแบบตั้งไว้ตายตัวว่าแปลง A/C/D กำลังรดน้ำ
 * โรงเรือนนี้ไม่มีระบบรดน้ำเลย (ดู DESIGN_SOURCE ข้อ 37) จุดจึงบอกแค่สภาพดิน
 */
export function heroDots(): readonly (readonly [string, HeroDotKind])[] {
  return DASH_ZONES.map((z) => [z.letter, DOT_OF_LEVEL[z.level]] as const);
}

export function heroDonut(): readonly { value: number; color: string }[] {
  const count = (lvl: DashLevel) => DASH_ZONES.filter((z) => z.level === lvl).length;
  return [
    { value: count('normal'), color: HERO_DOT_COLOR.normal },
    { value: count('warn'), color: HERO_DOT_COLOR.warn },
    { value: count('crit'), color: HERO_DOT_COLOR.dry },
  ].filter((sl) => sl.value > 0);
}

export const HERO_STATS = {
  health: 92,
  attention: 1,
  waterLitres: 1240,
  totalZones: 8,
} as const;

/* ───────────────────────── การ์ดเซนเซอร์ ───────────────────────── */

export const SENSOR_KEYS = ['temp', 'soil', 'light', 'hum'] as const;
export type SensorKey = (typeof SENSOR_KEYS)[number];

export interface SensorDef {
  readonly key: SensorKey;
  readonly labelKey: TextKey;
  readonly icon: IconName;
  readonly color: string;
  readonly iconBg: string;
  readonly unit: string;
  readonly adviceKey: TextKey;
  /** ป้ายสถานะตอนค่าปกติ — แสงใช้คำว่า "เหมาะสม" ต่างจากตัวอื่น */
  readonly okChipKey: TextKey;
  /** เซนเซอร์ค่าค้าง — ต้องขึ้นป้ายเตือนและปุ่มลองอ่านใหม่ */
  readonly stale: boolean;
  readonly spark: readonly number[];
}

/** ระดับสถานะจากค่าจริงเทียบเกณฑ์ที่ตั้งไว้ — เกณฑ์แก้ได้จาก Threshold Modal */
export function levelFor(value: number, th: Threshold): DashLevel {
  if (value < th.crit) return 'crit';
  if (value < th.warn) return 'warn';
  return 'normal';
}

export const SENSOR_DEFS: readonly SensorDef[] = [
  {
    key: 'temp',
    labelKey: 'senTemp',
    icon: 'temp',
    color: 'var(--d-m-temp)',
    iconBg: 'var(--d-m-temp-bg)',
    unit: '°C',
    adviceKey: 'advTemp',
    okChipKey: 'stNormal',
    stale: false,
    spark: [30, 31, 30, 32, 33, 32, 31, 31],
  },
  {
    key: 'soil',
    labelKey: 'senSoil',
    icon: 'soil',
    color: 'var(--d-m-soil)',
    iconBg: 'var(--d-m-soil-bg)',
    unit: '%',
    adviceKey: 'advSoil',
    okChipKey: 'stNormal',
    stale: true,
    spark: [27, 26, 25, 24, 24, 24, 24, 24],
  },
  {
    key: 'light',
    labelKey: 'senLight',
    icon: 'sun',
    color: 'var(--d-m-light)',
    iconBg: 'var(--d-m-light-bg)',
    unit: 'k lux',
    adviceKey: 'advLight',
    okChipKey: 'stGood',
    stale: false,
    spark: [38, 44, 41, 48, 45, 43, 46, 42],
  },
  {
    key: 'hum',
    labelKey: 'senHum',
    icon: 'humid',
    color: 'var(--d-m-hum)',
    iconBg: 'var(--d-m-hum-bg)',
    unit: '%',
    adviceKey: 'advHum',
    okChipKey: 'stNormal',
    stale: false,
    spark: [58, 60, 59, 63, 61, 62, 64, 62],
  },
];

/** ค่าที่ค้างของเซนเซอร์ดินโซน B — ไม่เคลื่อนไหวโดยตั้งใจ */
export const SOIL_STUCK_VALUE = 24;

/** ค่าจำลองที่ขยับทุก 4 วินาที */
export const LIVE_BASE = { temp: 31, hum: 62, light: 42 } as const;
export const LIVE_AMP = { temp: 1.2, hum: 3, light: 4 } as const;
export const LIVE_TICK_MS = 4000;

/* ───────────────────────── แจ้งเตือน / สุขภาพเซนเซอร์ ───────────────────────── */

export const NOTIFICATIONS: readonly { titleKey: TextKey; timeKey: TextKey; color: string }[] = [
  { titleKey: 'n1', timeKey: 'n1t', color: 'var(--d-warn)' },
  { titleKey: 'n2', timeKey: 'n2t', color: 'var(--d-m-light)' },
];

export const HEALTH_STEP_KEYS: readonly TextKey[] = ['hs1', 'hs2', 'hs3'];

/* ───────────────────────── เกณฑ์แจ้งเตือนเริ่มต้น ───────────────────────── */

export interface Threshold {
  readonly warn: number;
  readonly crit: number;
}

/** เกณฑ์ตั้งต้นของแต่ละค่า — ผู้ใช้แก้ได้จาก Threshold Modal แล้วมีผลจริงกับการ์ด */
export const DEFAULT_THRESHOLDS: Readonly<Record<SensorKey, Threshold>> = {
  temp: { warn: 18, crit: 12 },
  soil: { warn: 30, crit: 20 },
  light: { warn: 20, crit: 10 },
  hum: { warn: 45, crit: 35 },
};
