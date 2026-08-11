import type { ZoneId } from '@shared/zone';
import type { CropIconName, IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

/**
 * สถานะแปลงบนแผนที่ — บอกสภาพดินอย่างเดียว
 *
 * 🔴 เคยมี `'watering'` อยู่ด้วย **ถอดออกแล้ว 2026-08-11** — โรงเรือนนี้ไม่มีระบบรดน้ำ
 * ปั๊มที่มีคือปั๊มคูลลิ่งแพด ทำงานคู่พัดลมใหญ่ (ดู DESIGN_SOURCE ข้อ 37)
 */
export type IrrStatus = 'normal' | 'warn' | 'dry';

/** ชื่อเดิมที่โค้ดอื่นยังอ้างถึง — ตอนนี้เหมือน `IrrStatus` ทุกประการ */
export type ZoneBaseStatus = IrrStatus;

export const IRR_COLOR: Readonly<Record<IrrStatus, string>> = {
  normal: '#2f9e6e',
  warn: '#b9720f',
  dry: '#d14b47',
};

export const IRR_BG: Readonly<Record<IrrStatus, string>> = {
  normal: '#e1f1e9',
  warn: '#fbeedb',
  dry: '#f8e4e2',
};

export type WateringMode = 'manual' | 'schedule' | 'moisture' | 'hybrid';

export const MODE_LABEL: Readonly<Record<WateringMode, TextKey>> = {
  manual: 'modeManual',
  schedule: 'modeSchedule',
  moisture: 'modeMoisture',
  hybrid: 'modeHybrid',
};

export const MODE_DESC: Readonly<Record<WateringMode, TextKey>> = {
  manual: 'stratManualD',
  schedule: 'stratScheduleD',
  moisture: 'stratMoistureD',
  hybrid: 'stratHybridD',
};

export const MODE_COLOR: Readonly<Record<WateringMode, string>> = {
  manual: 'var(--d-muted)',
  schedule: 'var(--d-warn)',
  moisture: 'var(--d-m-hum)',
  hybrid: 'var(--brand-green)',
};

/** ไอคอนประจำแต่ละกลยุทธ์ — ใช้กับการ์ดเลือกกลยุทธ์ให้แยกออกด้วยสายตา */
export const MODE_ICON: Readonly<Record<WateringMode, IconName>> = {
  manual: 'drop',
  schedule: 'clock',
  moisture: 'soil',
  hybrid: 'bulb',
};

/**
 * ค่าตั้งต้นของแต่ละกลยุทธ์ที่แก้ได้จริง (เก็บใน React state ของหน้า)
 * ยังไม่ actuate จนกว่าจะต่อระบบจริง — ป้าย `rulesNotLiveNote` บอกไว้แล้ว
 */

/**
 * ข้อมูลแปลงที่ผู้ใช้ตั้งเอง (ชื่อ · พืช · พื้นที่ · ความชื้นเป้าหมาย)
 *
 * อยู่ที่นี่ไม่ใช่ในไฟล์ component เพราะ `FarmStateProvider` เป็นเจ้าของ state นี้
 * (provider ห้าม import จาก component — ผิดชั้น) เดิมเก็บเป็น state ของหน้าชลประทาน
 * กดบันทึกแล้วขึ้นว่า "บันทึกแล้ว" แต่เปลี่ยนหน้ากลับมาก็หายหมด
 */
export interface ZoneSettings {
  readonly name: string;
  readonly crop: string;
  readonly area: string;
  readonly target: string;
}

/** โหมดตั้งเวลา = "รดน้ำเวลาไหนบ้าง" (เวลาเริ่ม ไม่ใช่ระยะเวลา — ปั๊มไม่มีตัวตั้งเวลา) */
export const DEFAULT_SCHEDULE: readonly string[] = ['06:00', '17:30'];
export const MAX_SCHEDULE_TIMES = 4;

/** โหมดตามความชื้น — รดเมื่อดินต่ำกว่า low% · หยุดเมื่อเกิน high% (เงื่อนไข ไม่ใช่ระยะเวลา) */
export interface MoistureRule {
  readonly low: number;
  readonly high: number;
}
export const DEFAULT_MOISTURE: MoistureRule = { low: 35, high: 70 };

/** กติกาไฮบริดของทั้งฟาร์ม — เดิมตั้งแยกรายแปลง ซึ่งทำจริงไม่ได้ด้วยปั๊มตัวเดียว */
export interface HybridRules {
  readonly timeFrom: string;
  readonly timeTo: string;
  readonly moistLow: number;
  readonly moistHigh: number;
  readonly rain: number;
}
export const DEFAULT_HYBRID_RULES: HybridRules = {
  timeFrom: '06:00',
  timeTo: '18:00',
  moistLow: 35,
  moistHigh: 70,
  rain: 60,
};

/** โหมดรดน้ำอัตโนมัติ (เมื่อสวิตช์หลักเปิด) — ไม่มี "มือ" แล้ว (ปิดสวิตช์ = สั่งเอง) */
export type AutoMode = 'schedule' | 'moisture' | 'hybrid';

/**
 * ค่าตั้งรดน้ำของทั้งฟาร์ม — เก็บใน `FarmStateProvider` (persist ข้ามหน้า)
 * `autoOn` = สวิตช์หลัก · ปิด = รดเองด้วยปุ่ม · เปิด = ทำตาม `mode` ที่เลือก
 */
export interface WateringConfig {
  readonly autoOn: boolean;
  readonly mode: AutoMode;
  readonly hybrid: HybridRules;
  readonly schedule: readonly string[];
  readonly moisture: MoistureRule;
}
export const DEFAULT_WATERING_CONFIG: WateringConfig = {
  autoOn: false,
  mode: 'hybrid',
  hybrid: DEFAULT_HYBRID_RULES,
  schedule: DEFAULT_SCHEDULE,
  moisture: DEFAULT_MOISTURE,
};

/**
 * ผังแปลงบนแผนที่ชลประทาน — [x, y, w, h] เป็น % ของกรอบแผนที่
 *
 * ⚠️ นี่คือ **ผังมองจากด้านบน** คนละภาพกับ `ZONE_GEOMETRY` ของฉากเกม
 * ซึ่งเป็นพิกัดบนภาพ art มุมเปอร์สเปกทีฟ — ใช้แทนกันไม่ได้
 * สิ่งที่ใช้ร่วมกันคือ "โซนเดียวกัน 8 โซน" (`zoneId`) และชนิดพืช
 */
export interface IrrZone {
  readonly letter: string;
  readonly zoneId: ZoneId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly cropIcon: CropIconName;
  readonly cropKey: TextKey;
  readonly noteKey: TextKey;
  readonly moisture: number;
  readonly temp: number;
  readonly status: ZoneBaseStatus;
  /** ไร่ */
  readonly area: number;
  /** โรงเห็ด — ปิดทึบ ไม่ให้แสงเข้า จึงวาดเป็นสีเข้ม */
  readonly closed?: boolean;
}

export const IRR_ZONES: readonly IrrZone[] = [
  {
    letter: 'A',
    zoneId: 'kale',
    x: 0,
    y: 0,
    w: 31,
    h: 25,
    cropIcon: 'kale',
    cropKey: 'crop_kale',
    noteKey: 'note_kale',
    moisture: 48,
    temp: 24,
    status: 'normal',
    area: 2.5,
  },
  {
    letter: 'B',
    zoneId: 'flower',
    x: 34.5,
    y: 0,
    w: 31,
    h: 25,
    cropIcon: 'flowers',
    cropKey: 'crop_flowers',
    noteKey: 'note_flowers',
    moisture: 24,
    temp: 29,
    status: 'warn',
    area: 2.0,
  },
  {
    letter: 'C',
    zoneId: 'rosemary',
    x: 69,
    y: 0,
    w: 31,
    h: 25,
    cropIcon: 'rosemary',
    cropKey: 'crop_rosemary',
    noteKey: 'note_rosemary',
    moisture: 34,
    temp: 31,
    status: 'normal',
    area: 1.8,
  },
  {
    letter: 'D',
    zoneId: 'mushroom',
    x: 0,
    y: 37.5,
    w: 21,
    h: 25,
    cropIcon: 'mushroom',
    cropKey: 'crop_mushroom',
    noteKey: 'note_mushroom',
    moisture: 78,
    temp: 19,
    status: 'normal',
    area: 1.2,
    closed: true,
  },
  {
    letter: 'E',
    zoneId: 'lettuce',
    x: 30,
    y: 37.5,
    w: 52,
    h: 25,
    cropIcon: 'salad',
    cropKey: 'crop_salad',
    noteKey: 'note_salad',
    moisture: 52,
    temp: 23,
    status: 'normal',
    area: 3.0,
  },
  {
    letter: 'F',
    zoneId: 'cucumber',
    x: 0,
    y: 75,
    w: 31,
    h: 25,
    cropIcon: 'cucumber',
    cropKey: 'crop_cucumber',
    noteKey: 'note_cucumber',
    moisture: 58,
    temp: 27,
    status: 'normal',
    area: 2.2,
  },
  {
    letter: 'G',
    zoneId: 'strawberry',
    x: 34.5,
    y: 75,
    w: 31,
    h: 25,
    cropIcon: 'strawberry',
    cropKey: 'crop_strawberry',
    noteKey: 'note_strawberry',
    moisture: 35,
    temp: 22,
    status: 'dry',
    area: 1.5,
  },
  {
    letter: 'H',
    zoneId: 'tomato',
    x: 69,
    y: 75,
    w: 31,
    h: 25,
    cropIcon: 'tomato',
    cropKey: 'crop_tomato',
    noteKey: 'note_tomato',
    moisture: 45,
    temp: 30,
    status: 'normal',
    area: 2.0,
  },
];

/* ไม่มีเลเยอร์ 'ตัวควบคุม' แล้ว — ไม่มีตัวควบคุมรายโซนจริง */
export const MAP_LAYERS = ['status', 'moisture'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

export const LAYER_LABEL: Readonly<Record<MapLayer, TextKey>> = {
  status: 'layerStatus',
  moisture: 'layerMoisture',
};

/** สีของแปลงตามเลเยอร์ที่เลือก */
export function layerColor(z: IrrZone, layer: MapLayer): string {
  if (layer === 'moisture') {
    const m = z.moisture;
    return m < 30 ? '#d14b47' : m < 40 ? '#b9720f' : m < 50 ? '#5aae7a' : '#2f8f8a';
  }
  return IRR_COLOR[z.status];
}

/** ปรับความสว่างของสี hex — ใช้ไล่เฉดดินในแปลง */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(Math.min(255, ((n >> 16) & 255) * factor));
  const g = Math.round(Math.min(255, ((n >> 8) & 255) * factor));
  const b = Math.round(Math.min(255, (n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

/* ───────────────────────── พยากรณ์อากาศ ───────────────────────── */

export type WxKind = 'rain' | 'cloud' | 'sun';

export const FORECAST: readonly { thTime: string; enTime: string; temp: number; kind: WxKind }[] = [
  { thTime: '14:00', enTime: '2 PM', temp: 31, kind: 'rain' },
  { thTime: '15:00', enTime: '3 PM', temp: 30, kind: 'rain' },
  { thTime: '16:00', enTime: '4 PM', temp: 29, kind: 'cloud' },
  { thTime: '17:00', enTime: '5 PM', temp: 28, kind: 'cloud' },
];

/* ───────────────────────── ระบบน้ำ ───────────────────────── */

/**
 * ระดับน้ำในถังไม่ได้อยู่ที่นี่แล้ว — ถังมีใบเดียว อ่านจาก `FarmStateProvider` (`tank`)
 * ของเดิมประกาศ 72% ไว้ตรงนี้ ขณะที่ guard G1 ใช้ 62% จาก `data/devices.ts`
 * ถังใบเดียวกันแต่บอกคนละเลข แล้วแต่ว่าเปิดหน้าไหน
 */

/*
 * `TANK_GUARD_PCT = 25` ถูกตัดออกแล้ว — เกณฑ์ถังมีค่าเดียวคือ `TANK_MIN_PCT`
 * ใน `@shared/thresholds` (20%) ตัวที่ guard G1 ใช้จริง
 * ของเดิมหน้านี้ปิดปุ่มที่ 25% ขณะที่ระบบยังยอมให้สั่งได้ถึง 20%
 */

export const ATTENTION_ITEMS: readonly {
  letter: string;
  titleKey: TextKey;
  subKey: TextKey;
  color: string;
}[] = [
  { letter: 'B', titleKey: 'attn1', subKey: 'attn1s', color: 'var(--d-warn)' },
  { letter: 'G', titleKey: 'attn2', subKey: 'attn2s', color: '#d16a52' },
];

/* ───────────────────────── ลิ้นชักรายโซน ───────────────────────── */

/**
 * ลิ้นชักเหลือ 4 แท็บ — แท็บ "ควบคุม" กับ "อัตโนมัติ" ย้ายขึ้นไปเป็นส่วนของทั้งฟาร์ม
 * บนหน้าชลประทาน เพราะสั่งรดน้ำทีละแปลงไม่ได้จริง ลิ้นชักจึงเหลือหน้าที่ "ดูข้อมูลแปลง"
 */
export const DRAWER_TABS = ['overview', 'sensors', 'history', 'settings'] as const;
export type DrawerTab = (typeof DRAWER_TABS)[number];

export const DRAWER_TAB_LABEL: Readonly<Record<DrawerTab, TextKey>> = {
  overview: 'tabOverview',
  sensors: 'tabSensors',
  history: 'tabHistory',
  settings: 'tabSettings',
};

export const DRAWER_SENSORS: readonly {
  labelKey: TextKey;
  icon: IconName;
  color: string;
  bg: string;
  /** null = ใช้ค่าความชื้นจริงของโซนที่เปิดอยู่ */
  value: number | null;
  unit: string;
  data: readonly number[];
}[] = [
  {
    labelKey: 'dsSoil',
    icon: 'soil',
    color: 'var(--d-m-soil)',
    bg: 'var(--d-m-soil-bg)',
    value: null,
    unit: '%',
    data: [27, 26, 25, 24, 24, 24],
  },
  {
    labelKey: 'dsTemp',
    icon: 'temp',
    color: 'var(--d-m-temp)',
    bg: 'var(--d-m-temp-bg)',
    value: 29,
    unit: '°C',
    data: [28, 29, 30, 29, 29, 29],
  },
  {
    labelKey: 'dsHum',
    icon: 'humid',
    color: 'var(--d-m-hum)',
    bg: 'var(--d-m-hum-bg)',
    value: 66,
    unit: '%',
    data: [62, 64, 63, 66, 65, 66],
  },
  // ตัด "อัตราการไหล 12 L/min" ออก — ไม่มีเซนเซอร์วัดการไหลจริง (เคยตัดออกจากที่อื่นแล้ว)
];

/*
 * เดิมมีตัวเลือกระยะเวลารดน้ำ 10/20/30/60 นาที — ตัดออกแล้ว
 * ปั๊มที่ต่ออยู่เป็นสวิตช์เปิด/ปิดล้วน ไม่มีตัวตั้งเวลา การโชว์ตัวเลือกไว้จึงเป็นปุ่มหลอก
 * ถ้าจะเอากลับ ต้องทำตัวนับเวลาที่สั่งปิดปั๊มจริงเมื่อครบกำหนด
 */

export const TARGET_MOISTURE = 40;

/** ประวัติการรดน้ำของโซน */
export type TimelineMode = 'auto' | 'manual' | 'skip' | 'schedule';

export const TIMELINE_META: Readonly<
  Record<TimelineMode, { color: string; bg: string; labelKey: TextKey }>
> = {
  auto: { color: 'var(--d-m-hum)', bg: 'var(--d-m-hum-bg)', labelKey: 'tlAuto' },
  manual: { color: 'var(--d-muted)', bg: 'var(--d-line-2)', labelKey: 'tlManual' },
  skip: { color: 'var(--d-warn)', bg: 'var(--d-warn-bg)', labelKey: 'tlSkip' },
  schedule: { color: 'var(--brand-green)', bg: 'var(--d-ok-bg)', labelKey: 'tlSchedule' },
};

export const ZONE_HISTORY: readonly { mode: TimelineMode; timeKey: TextKey; titleKey: TextKey }[] =
  [
    { mode: 'skip', timeKey: 'hist1t', titleKey: 'hist1d' },
    { mode: 'auto', timeKey: 'hist2t', titleKey: 'hist2d' },
    { mode: 'schedule', timeKey: 'hist3t', titleKey: 'hist3d' },
    { mode: 'manual', timeKey: 'hist4t', titleKey: 'hist4d' },
    { mode: 'auto', timeKey: 'hist5t', titleKey: 'hist5d' },
  ];

/** แหล่งที่มาของคำสั่งใน control log */
export type CmdSource = 'manual' | 'schedule' | 'sensor';

export const CMD_SOURCE_META: Readonly<
  Record<CmdSource, { color: string; bg: string; labelKey: TextKey }>
> = {
  manual: { color: 'var(--d-muted)', bg: 'var(--d-line-2)', labelKey: 'tlManual' },
  schedule: { color: 'var(--brand-green)', bg: 'var(--d-ok-bg)', labelKey: 'tlSchedule' },
  sensor: { color: 'var(--d-m-hum)', bg: 'var(--d-m-hum-bg)', labelKey: 'srcSensor' },
};

export const SEED_CMD_LOG: readonly {
  titleKey: TextKey;
  src: CmdSource;
  time: string;
  byKey: TextKey;
}[] = [
  { titleKey: 'clAutoWater', src: 'sensor', time: '05:30', byKey: 'byRule' },
  { titleKey: 'clSkipRain', src: 'schedule', time: '13:00', byKey: 'bySystem' },
];

/**
 * หมวดแจ้งเตือนที่ผู้ใช้เปิด/ปิดได้ — แต่ละหมวดผูกกับ alert ที่มีจริงใน `useFarmAlerts`
 * `climate` = อากาศ (อุณหภูมิ/ความชื้น/แสง) · `soil` = ความชื้นดิน · `device` = อุปกรณ์หลุด
 * (เดิมเป็น rain/dry/offline โดยที่ไม่มีใครอ่านค่า — ป้ายก็อ้างฟีเจอร์ที่ถอดไปแล้ว)
 */
export const NOTIF_TOGGLE_KEYS = ['climate', 'soil', 'device'] as const;
export type NotifToggleKey = (typeof NOTIF_TOGGLE_KEYS)[number];

export const NOTIF_TOGGLE_LABEL: Readonly<Record<NotifToggleKey, TextKey>> = {
  climate: 'ntClimate',
  soil: 'ntSoilAlert',
  device: 'ntDevice',
};
