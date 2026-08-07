import { deviceRunning } from '@shared/device';
import type { Device, DeviceId } from '@shared/device';
import type { HsDays } from '@shared/handysense';
import type { ClimateKey, ClimateValues } from '@shared/sensor';
import { CLIMATE_RANGE, TANK_MIN_PCT } from '@shared/thresholds';
import type { IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

/** โหมดการทำงานของอุปกรณ์ในโรงเรือน */
/**
 * โหมดอุปกรณ์เหลือ 2 สถานะ: `manual` (สั่งเองด้วยสวิตช์) · `auto` (ทำตามเงื่อนไข)
 * เดิมมี `schedule` เป็นโหมดที่ 3 — ตอนนี้ "ตารางเวลา" เป็น config รายอุปกรณ์ในส่วนเงื่อนไขรวมแทน
 * (การ์ดอุปกรณ์จึงเหลือสวิตช์เปิด/ปิด + ปุ่ม toggle "อัตโนมัติ" · ไม่มีคำ "มือ" ซ้ำ)
 */
export const GH_MODES = ['manual', 'auto'] as const;
export type GhMode = (typeof GH_MODES)[number];

export const GH_MODE_LABEL: Readonly<Record<GhMode, TextKey>> = {
  manual: 'modeManual',
  auto: 'ghModeAuto',
};

/** เงื่อนไขหนึ่งข้อของกฎอัตโนมัติ — ตัวเลขแก้ได้จริง */
export interface GhCondition {
  readonly id: string;
  readonly labelKey: TextKey;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
}

export interface GhDevice {
  /** ใช้ id เดียวกับอุปกรณ์จริง 4 ตัวในฉากเกม */
  readonly id: DeviceId;
  readonly nameKey: TextKey;
  readonly subKey: TextKey;
  readonly icon: IconName;
  readonly on: boolean;
  readonly mode: GhMode;
  readonly offline: boolean;
  /** null = ไม่มีกฎอัตโนมัติ */
  readonly rule: { readonly op: 'AND' | 'OR'; readonly conditions: readonly GhCondition[] } | null;
}

/**
 * อุปกรณ์จริง 4 ตัว — ชื่อไทยมาจากคีย์เดียวกับฉากเกม (`bigFan` / `smallFan` / `pump`)
 * ต้นแบบโรงเรือนใช้คำว่า "พัดลมใบใหญ่ #1" ตรงกับ `deviceName()` ของฉากเกมพอดี
 * เจ้าของงานอนุมัติลดพัดลมเล็ก 2 → 1 ตัว (บันทึกใน DESIGN_SOURCE.md)
 */
export const GH_DEVICES: readonly GhDevice[] = [
  {
    id: 'big1',
    nameKey: 'bigFan',
    subKey: 'dBFanSub',
    icon: 'fan',
    on: true,
    mode: 'auto',
    offline: false,
    rule: {
      op: 'AND',
      conditions: [
        { id: 'rh', labelKey: 'rBFan1', value: 70, unit: '%', min: 40, max: 95 },
        { id: 'temp', labelKey: 'rBFan2', value: 32, unit: '°C', min: 20, max: 45 },
      ],
    },
  },
  {
    id: 'big2',
    nameKey: 'bigFan',
    subKey: 'dBFanSub',
    icon: 'fan',
    on: false,
    mode: 'auto',
    offline: false,
    rule: {
      op: 'AND',
      conditions: [
        { id: 'rh', labelKey: 'rBFan1', value: 70, unit: '%', min: 40, max: 95 },
        { id: 'temp', labelKey: 'rBFan2', value: 32, unit: '°C', min: 20, max: 45 },
      ],
    },
  },
  {
    id: 'sml1',
    nameKey: 'smallFan',
    subKey: 'dSFanSub',
    icon: 'fan',
    on: true,
    mode: 'auto',
    offline: false,
    /*
     * เงื่อนไขที่สองเดิมเป็น CO₂ แต่ฟาร์มไม่มีเซนเซอร์ CO₂ → เปลี่ยนเป็นอุณหภูมิ
     * (เซนเซอร์จริงที่มี) ไม่ตัดให้เหลือเงื่อนไขเดียว เพราะ OR ที่มีข้างเดียวไม่มีความหมาย
     * และต้นแบบตั้งใจให้พัดลมเล็กมีสองทางกระตุ้น
     */
    rule: {
      op: 'OR',
      conditions: [
        { id: 'rh', labelKey: 'rSFan1', value: 65, unit: '%', min: 40, max: 95 },
        { id: 'temp', labelKey: 'rSFan2', value: 34, unit: '°C', min: 20, max: 45 },
      ],
    },
  },
  {
    id: 'pump',
    nameKey: 'pump',
    subKey: 'dPumpSub',
    icon: 'pump',
    on: false,
    mode: 'manual',
    offline: false,
    rule: {
      op: 'AND',
      conditions: [{ id: 'soil', labelKey: 'rPump1', value: 45, unit: '%', min: 10, max: 80 }],
    },
  },
];

/** เลข # ต่อท้ายชื่ออุปกรณ์ (ปั๊มไม่มี) */
export const GH_DEVICE_NUMBER: Readonly<Partial<Record<DeviceId, number>>> = {
  big1: 1,
  big2: 2,
  sml1: 1,
};

/**
 * เกณฑ์อุณหภูมิอัตโนมัติต่อพัดลม — ส่งไปอุปกรณ์จริงผ่าน HandySense `setThreshold`
 *
 * 🔴 ทิศทางสำคัญ (จุดพลาดอันดับ 1 ของ guide · ไม่มี error ให้เห็นถ้า label ผิด):
 *   อุณหภูมิ **ต่ำกว่า `min` → ปิดพัดลม** · **สูงกว่า `max` → เปิดพัดลม** (พัดลมระบายความร้อน)
 *
 * HandySense `setThreshold` มีแค่ temp/soil (ไม่มี humidity) · พัดลมใช้ temp · soil ปิดไว้ (ส่ง enabled:false)
 */
export interface FanTempThreshold {
  readonly enabled: boolean;
  /** °C · ต่ำกว่านี้ = ปิดพัดลม */
  readonly min: number;
  /** °C · สูงกว่านี้ = เปิดพัดลม */
  readonly max: number;
}

/** ค่าเริ่มต้น (อิงเกณฑ์จริงของอุปกรณ์จาก guide §5) — persist ใน `FarmStateProvider` · โหมดจริง seed จากอุปกรณ์ */
export const DEFAULT_FAN_THRESHOLDS: Readonly<Record<DeviceId, FanTempThreshold>> = {
  big1: { enabled: true, min: 30, max: 31 },
  big2: { enabled: true, min: 34, max: 35 },
  sml1: { enabled: true, min: 32, max: 34 },
  pump: { enabled: false, min: 0, max: 0 }, // ปั๊มยังไม่ต่อ relay จริง
};

/**
 * ควบคุมความชื้นอากาศด้วยพัดลมดูด — **แอปสั่งเอง** (อุปกรณ์ไม่รองรับ rh threshold)
 * เป็นค่า farm-wide ตัวเดียว (ความชื้นอากาศเป็นของทั้งโรงเรือน ไม่แยกรายพัดลม)
 * `onAt > offAt` เสมอ (ช่อง hysteresis กันพัดลมเปิด-ปิดถี่) · window `start === end` = ทั้งวัน
 */
export interface HumidityAuto {
  readonly enabled: boolean;
  /** RH% ที่เริ่มดูด (สูงกว่านี้ → เปิดพัดลม) */
  readonly onAt: number;
  /** RH% ที่หยุด (ต่ำกว่านี้ → ปิด) — ต้อง < onAt */
  readonly offAt: number;
  /** จำกัดเฉพาะช่วงเวลาไหม · `false` = ดูดตาม RH ทั้งวัน (ไม่สนเวลา) */
  readonly useWindow: boolean;
  /** "HH:mm" ช่วงที่อนุญาตให้ดูด (ใช้เมื่อ useWindow) · ไม่รองรับข้ามเที่ยงคืน */
  readonly windowStart: string;
  readonly windowEnd: string;
}

export const DEFAULT_HUMIDITY_AUTO: HumidityAuto = {
  enabled: false,
  onAt: 85,
  offAt: 70, // ช่องห่าง 15% (กว้าง = เปิด-ปิดน้อยรอบ ประหยัดไฟ · ดูดลงถึง 70% แห้งกว่า ปลอดรา)
  useWindow: false,
  windowStart: '05:00',
  windowEnd: '18:00',
};

/**
 * ตารางเวลารายอุปกรณ์ (ส่งเป็น HandySense `setSchedule`) — สูงสุด 3 slot ต่ออุปกรณ์
 *
 * 🔴 อันตราย (guide top-5 #3): ปุ่ม pause/resume ต้องส่ง **โหมด B (enable อย่างเดียว ห้ามมี days)**
 * ถ้าส่ง days ที่ไม่ติ๊กพร้อม enable:false = **ลบตารางถาวร** · แก้วัน/เวลาเป็นคนละปุ่ม (โหมด A)
 * เวลาเก็บเป็น "HH:mm" (UI) → เติม ":00" เป็น "HH:mm:ss" ตอนส่ง · ยังไม่รองรับข้ามเที่ยงคืน
 */
export interface DeviceScheduleSlot {
  /** เลข slot ในอุปกรณ์ 0-2 — **identity คงที่** (ไม่ใช่ตำแหน่งใน array) กันสั่งผิด slot หลังลบ */
  readonly slot: number;
  readonly enable: boolean;
  readonly days: HsDays;
  readonly startTime: string; // "HH:mm"
  readonly endTime: string;
}

/** สูงสุด 3 slot ต่อสวิตช์ (slot 0-2) — เกินนี้สร้างข้อมูลค้างในอุปกรณ์ที่ลบไม่ได้ตลอดไป */
export const MAX_SCHEDULE_SLOTS = 3;

const EVERYDAY: HsDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
};

export const DEFAULT_DEVICE_SCHEDULES: Readonly<Record<DeviceId, readonly DeviceScheduleSlot[]>> = {
  big1: [{ slot: 0, enable: true, days: EVERYDAY, startTime: '18:00', endTime: '20:00' }],
  big2: [{ slot: 0, enable: true, days: EVERYDAY, startTime: '18:00', endTime: '20:00' }],
  sml1: [{ slot: 0, enable: true, days: EVERYDAY, startTime: '12:00', endTime: '13:00' }],
  pump: [{ slot: 0, enable: true, days: EVERYDAY, startTime: '06:00', endTime: '06:30' }],
};

/* ───────────────────────── สภาพอากาศในโรงเรือน ───────────────────────── */

export interface GhClimateCard {
  /** ค่าไหนของ `ClimateValues` — หน้าเพจใช้เทียบกับ `live.fields` ว่าเป็นของจริงไหม */
  readonly key: ClimateKey;
  readonly labelKey: TextKey;
  readonly noteKey: TextKey;
  readonly icon: IconName;
  readonly color: string;
  readonly value: string;
  readonly unit: string;
  /** 0–1 สำหรับวงแหวน */
  readonly ratio: number;
  readonly warn: boolean;
}

/** หน้าตาของการ์ดแต่ละใบ — ส่วนที่ไม่ขึ้นกับค่าที่อ่านได้ */
const GH_CLIMATE_META = [
  {
    key: 'temp',
    labelKey: 'cTemp',
    noteKey: 'cTempNote',
    icon: 'temp',
    color: 'var(--d-m-temp)',
    unit: '°C',
    digits: 1,
  },
  {
    key: 'rh',
    labelKey: 'cHum',
    noteKey: 'cHumNote',
    icon: 'humid',
    color: 'var(--d-m-hum)',
    unit: '%',
    digits: 0,
  },
  {
    key: 'lux',
    labelKey: 'cLight',
    noteKey: 'cLightNote',
    icon: 'sun',
    color: 'var(--d-m-light)',
    unit: 'k lux',
    digits: 0,
  },
] as const satisfies readonly {
  key: ClimateKey;
  labelKey: TextKey;
  noteKey: TextKey;
  icon: IconName;
  color: string;
  unit: string;
  digits: number;
}[];

/**
 * การ์ดสภาพอากาศในโรงเรือน — คำนวณจากค่าจริงที่ `FarmStateProvider` ถืออยู่
 *
 * เดิมเป็นตัวเลขคงที่ (29°C · 73% · 46k lux) คนละชุดกับฉากเกม
 * ทำให้โรงเรือนหลังเดียวรายงานอุณหภูมิสองค่า และกฎ G2 ตัดสินไม่เหมือนกันตามหน้าที่เปิด
 * เกณฑ์ "อยู่ในช่วงปกติหรือไม่" ใช้ `CLIMATE_RANGE` ตัวเดียวกับ HUD ของฉากเกม
 */
export function ghClimateCards(climate: ClimateValues): readonly GhClimateCard[] {
  return GH_CLIMATE_META.map((m) => {
    const v = climate[m.key];
    const r = CLIMATE_RANGE[m.key];
    return {
      key: m.key,
      labelKey: m.labelKey,
      noteKey: m.noteKey,
      icon: m.icon,
      color: m.color,
      value: v.toFixed(m.digits),
      unit: m.unit,
      ratio: Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min))),
      warn: v < r.lo || v > r.hi,
    };
  });
}

/* ───────────────────────── ระบบน้ำ ───────────────────────── */

export interface WaterInfraRow {
  readonly icon: IconName;
  readonly nameKey: TextKey;
  readonly detailKey: TextKey;
  readonly statusKey: TextKey;
  readonly color: string;
  readonly bg: string;
}

/**
 * รายการอุปกรณ์ระบบน้ำ — ย้ายมาจากหน้าชลประทาน (`INFRA_ITEMS`)
 *
 * ของเดิมเป็น array คงที่: แถวปั๊มฝัง `statusKey: 'stRun'` ไว้ตายตัว
 * ปิดปั๊มที่หน้าโรงเรือนแล้วหน้าชลประทานก็ยังบอกว่า "ทำงาน" — ปั๊มตัวเดียวกันแต่พูดคนละเรื่อง
 * ตอนนี้อ่านจากอุปกรณ์จริงกับถังจริง เหมือนที่ `ghClimateCards()` ทำกับค่าอากาศ
 */
export function waterInfraRows(devices: readonly Device[], tank: number): readonly WaterInfraRow[] {
  const pump = devices.find((d) => d.id === 'pump');
  const pumpRunning = pump ? deviceRunning(pump) : false;
  // ต้องเป็น `<` ให้ตรงกับ `guard()` เป๊ะ — เดิมใช้ `<=` ที่ 20% พอดีจึงขึ้นป้าย "ต้องดู"
  // ทั้งที่ guard ยังปล่อยให้เปิดปั๊มได้ ถังใบเดียวแต่หน้าจอกับกฎพูดคนละอย่าง
  const tankLow = tank < TANK_MIN_PCT;

  return [
    {
      icon: 'tank',
      nameKey: 'infraTank',
      detailKey: 'infraTankD',
      // เกณฑ์เดียวกับ guard G1 — ถ้าถังต่ำจนปั๊มเปิดไม่ได้ ต้องเห็นตรงนี้ด้วย
      statusKey: tankLow ? 'stWatch' : 'stOk',
      color: tankLow ? 'var(--d-warn)' : 'var(--d-ok)',
      bg: tankLow ? 'var(--d-warn-bg)' : 'var(--d-ok-bg)',
    },
    {
      icon: 'pump',
      nameKey: 'infraPump',
      detailKey: 'infraPumpD',
      statusKey: !pump?.online ? 'stOffline' : pumpRunning ? 'stRun' : 'stOff',
      color: !pump?.online ? 'var(--d-crit)' : pumpRunning ? 'var(--d-m-hum)' : 'var(--d-muted)',
      bg: !pump?.online
        ? 'var(--d-crit-bg)'
        : pumpRunning
          ? 'var(--d-m-hum-bg)'
          : 'var(--d-line-2)',
    },
    {
      // ท่อไม่มีเซนเซอร์จริง — ค่านี้คงที่ตามต้นแบบ พอต่อ ThingsBoard ค่อยผูกของจริง
      icon: 'pipe',
      nameKey: 'infraLine',
      detailKey: 'infraLineD',
      statusKey: 'stCheck',
      color: 'var(--d-warn)',
      bg: 'var(--d-warn-bg)',
    },
  ];
}

/*
 * `GH_COMMAND_MS` (1100) · `GH_SEED_LOG` · `GH_SRC_META` · `GH_LOG_LIMIT` ถูกตัดออกแล้ว
 *
 * หน้านี้เคยมีห่วงโซ่คำสั่งกับ control log ของตัวเองซ้อนอยู่ ทั้งที่อุปกรณ์เป็นชุดเดียวกับหน้าอื่น
 * ผลคือหน่วงเวลาไม่เท่ากัน (1100 กับ 1700) และประวัติคำสั่งสองชุดที่ไม่มีวันตรงกัน
 * ตอนนี้ใช้ `useDeviceCommand` + `command.log` + `SEED_CMD_LOG`/`CMD_SOURCE_META`
 * จาก `data/irrigation.ts` ร่วมกันทั้งระบบ
 */
