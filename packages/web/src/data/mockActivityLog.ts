import type { IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

export const LOG_CATS = ['water', 'fert', 'spray', 'harvest'] as const;
export type LogCat = (typeof LOG_CATS)[number];

export const LOG_CAT_META: Readonly<
  Record<LogCat, { labelKey: TextKey; color: string; bg: string; icon: IconName }>
> = {
  water: { labelKey: 'catWater', color: 'var(--d-m-hum)', bg: 'var(--d-m-hum-bg)', icon: 'water' },
  fert: { labelKey: 'catFert', color: 'var(--d-warn)', bg: 'var(--d-warn-bg)', icon: 'npk' },
  spray: { labelKey: 'catSpray', color: '#6a7a3c', bg: '#eef1de', icon: 'spray' },
  harvest: { labelKey: 'catHarvest', color: 'var(--d-ok)', bg: 'var(--d-ok-bg)', icon: 'harvest' },
};

export interface DashLogEntry {
  readonly cat: LogCat;
  /** ข้อความจาก DICT (รายการตั้งต้น) หรือข้อความที่ผู้ใช้พิมพ์เอง */
  readonly titleKey?: TextKey;
  readonly title?: string;
  readonly metaKey?: TextKey;
  readonly meta?: string;
  readonly photo: boolean;
}

export const INITIAL_DASH_LOGS: readonly DashLogEntry[] = [
  { cat: 'water', titleKey: 'logW1', metaKey: 'logMeta1', photo: false },
  { cat: 'fert', titleKey: 'logF1', metaKey: 'logMeta2', photo: true },
  { cat: 'spray', titleKey: 'logS1', metaKey: 'logMeta3', photo: true },
  { cat: 'water', titleKey: 'logW2', metaKey: 'logMeta4', photo: false },
];

/** ข้อความเริ่มต้นเมื่อบันทึกเร็วโดยไม่พิมพ์อะไร */
export const QA_DEFAULT_KEY: Readonly<Record<LogCat, TextKey>> = {
  water: 'qaDefault_water',
  fert: 'qaDefault_fert',
  spray: 'qaDefault_spray',
  harvest: 'qaDefault_harvest',
};

/** จำนวนรายการที่โชว์บนแดชบอร์ด — ที่เหลือดูได้ในหน้าบันทึกเต็ม */
export const VISIBLE_LOGS = 3;

export const filterLogs = (
  entries: readonly DashLogEntry[],
  cat: LogCat | 'all',
): readonly DashLogEntry[] => (cat === 'all' ? entries : entries.filter((e) => e.cat === cat));
