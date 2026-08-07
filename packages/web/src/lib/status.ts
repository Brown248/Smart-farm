import { CLIMATE_DEVIATION_CRIT, CLIMATE_RANGE } from '@shared/thresholds';
import { CLIMATE_KEYS } from '@shared/sensor';
import type { ClimateKey, ClimateValues } from '@shared/sensor';
import type { ZoneStatus } from '@shared/zone';
import type { Dict, TextKey } from '@/i18n/keys';
import { clamp } from './format';

/** สีสถานะ อ้าง token เดียวกับ tokens.css — ห้ามเขียน hex ซ้ำในโค้ด */
export const STATUS_COLOR = {
  ok: 'var(--st-ok)',
  low: 'var(--st-warn)',
  critical: 'var(--st-crit)',
  watering: 'var(--st-water)',
  offline: 'var(--st-offline)',
} as const;

export const zoneColor = (s: ZoneStatus): string => STATUS_COLOR[s];

const ZONE_STATUS_KEY: Readonly<Record<ZoneStatus, TextKey>> = {
  ok: 'zsOk',
  low: 'zsLow',
  critical: 'zsCrit',
  watering: 'zsWater',
};

export const zoneStatusText = (s: ZoneStatus, t: Dict): string => t[ZONE_STATUS_KEY[s]];

/** โซนที่ต้องมีป้ายกำกับ: เตือน / วิกฤต เท่านั้น (ปกติ = หมุดเปล่า) */
export const zoneNeedsChip = (s: ZoneStatus): boolean => s === 'critical' || s === 'low';

/* ───────────────────────── HUD ───────────────────────── */

export type ClimateLevel = 'ok' | 'warn' | 'crit';

export interface HudCard {
  readonly key: ClimateKey;
  readonly label: string;
  /** ตัวเลข + หน่วย เช่น "33.4 °C" หรือ "78%" */
  readonly value: string;
  /** ช่วงที่ถือว่าปกติ เช่น "22–32" */
  readonly note: string;
  readonly level: ClimateLevel;
  readonly color: string;
  /** มุมของวงแหวน conic-gradient */
  readonly deg: string;
  readonly sheenDelay: string;
}

const LABEL_KEY: Readonly<Record<ClimateKey, TextKey>> = {
  temp: 'hudTemp',
  rh: 'hudRh',
  lux: 'hudLux',
};

const LEVEL_COLOR: Readonly<Record<ClimateLevel, string>> = {
  ok: STATUS_COLOR.ok,
  warn: STATUS_COLOR.low,
  crit: STATUS_COLOR.critical,
};

function unitOf(key: ClimateKey, t: Dict): string {
  switch (key) {
    case 'temp':
      return '°C';
    case 'rh':
      return '%';
    case 'lux':
      return t.luxUnit;
  }
}

function textOf(key: ClimateKey, v: number): string {
  switch (key) {
    case 'temp':
    case 'lux':
      return v.toFixed(1);
    case 'rh':
      return String(Math.round(v));
  }
}

/** เกินเกณฑ์แค่ไหนถึงนับว่าวิกฤต — เทียบกับความกว้างของช่วงปกติ */
export function climateLevel(key: ClimateKey, v: number): ClimateLevel {
  const { lo, hi } = CLIMATE_RANGE[key];
  const span = hi - lo;
  if (v > hi) return v - hi > span * CLIMATE_DEVIATION_CRIT ? 'crit' : 'warn';
  if (v < lo) return lo - v > span * CLIMATE_DEVIATION_CRIT ? 'crit' : 'warn';
  return 'ok';
}

/**
 * การ์ด HUD 4 ใบตามลำดับในต้นแบบ
 *
 * หมายเหตุ: ต้นแบบคำนวณข้อความบรรยาย (inRange / slightHigh / …) ไว้แต่แสดง
 * ช่วงตัวเลข "lo–hi" แทนในการ์ดจริง เราคงพฤติกรรมที่แสดงผลไว้เหมือนเดิม
 * และคงคีย์แปลทั้ง 5 ตัวไว้เพื่อความเท่ากันของสองภาษา
 */
export function hudCards(values: ClimateValues, t: Dict): readonly HudCard[] {
  return CLIMATE_KEYS.map((key, i) => {
    const v = values[key];
    const { lo, hi, min, max } = CLIMATE_RANGE[key];
    const ratio = clamp((v - min) / (max - min), 0, 1);
    const level = climateLevel(key, v);
    const unit = unitOf(key, t);
    return {
      key,
      label: t[LABEL_KEY[key]],
      value: textOf(key, v) + (unit === '%' ? '' : ' ') + unit,
      note: lo + '–' + hi,
      level,
      color: LEVEL_COLOR[level],
      deg: Math.max(6, ratio * 360).toFixed(1) + 'deg',
      sheenDelay: i * 4.2 + 's',
    };
  });
}

/** การ์ดใบแรกที่หลุดเกณฑ์ — ใช้เป็นข้อมูลให้ข้อความของ agent */
export const firstBadCard = (cards: readonly HudCard[]): HudCard | undefined =>
  cards.find((c) => c.level !== 'ok');
