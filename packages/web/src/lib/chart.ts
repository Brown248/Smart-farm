import type { TextKey } from '@/i18n/keys';

export const METRIC_KEYS = ['soil', 'temp', 'hum', 'light'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
/** 'all' = ดู 4 ค่าพร้อมกัน แต่ละเส้นสเกลตามช่วงของตัวเอง */
export type TrendMetric = MetricKey | 'all';

export const RANGE_KEYS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** จำนวนจุดต่อช่วงเวลา — ตรงกับต้นแบบ */
/**
 * จำนวนจุดต่อช่วงเวลา — ต้อง "ยิ่งช่วงยาว ยิ่งจุดไม่น้อยกว่าช่วงสั้น" ไม่งั้นสัปดาห์/ปีจะดูหยาบเป็นเหลี่ยม
 * กว่ารายวัน (เดิม week=7 · year=12 น้อยกว่า day=24 · month=30 → กราฟดูแปลกตอนสลับช่วง)
 * hour=ทุก 5 นาที · day=ทุกชม. · week=ทุก 6 ชม. · month=รายวัน · year=ทุก ~2 สัปดาห์
 */
export const RANGE_POINTS: Readonly<Record<RangeKey, number>> = {
  hour: 12,
  day: 24,
  week: 28,
  month: 30,
  year: 26,
};

export interface MetricConfig {
  readonly base: number;
  readonly amp: number;
  readonly color: string;
  readonly unit: string;
  /** ค่าปัจจุบันที่โชว์เป็นตัวเลขใหญ่เหนือกราฟ */
  readonly current: string;
  readonly labelKey: TextKey;
}

export const METRIC_CFG: Readonly<Record<MetricKey, MetricConfig>> = {
  soil: {
    base: 24,
    amp: 0.4,
    color: 'var(--d-m-soil)',
    unit: '%',
    current: '24%',
    labelKey: 'mWater',
  },
  temp: {
    base: 31,
    amp: 3,
    color: 'var(--d-m-temp)',
    unit: '°C',
    current: '31°C',
    labelKey: 'mTemp',
  },
  hum: { base: 62, amp: 6, color: 'var(--d-m-hum)', unit: '%', current: '62%', labelKey: 'mHum' },
  light: {
    base: 42,
    amp: 8,
    color: 'var(--d-m-light)',
    unit: 'k lux',
    current: '42k lux',
    labelKey: 'mLight',
  },
};

/**
 * ขอบเขตที่ค่านั้น **เป็นไปได้จริงทางกายภาพ** — แกนกราฟห้ามเลยออกไปนอกนี้
 *
 * เคยพลาดมาแล้วและเห็นชัดบนจอ: แกนความชื้นอากาศขึ้น `102.9%` และแสงลงไป `-0.8 k lux`
 * เพราะช่วงของแกนเผื่อขอบ 18% จากค่าจริงโดยไม่สนใจว่าค่านั้นเกินจริงไปแล้ว
 * ตัวเลขที่เป็นไปไม่ได้บนแกนทำให้คนอ่านสงสัยข้อมูลทั้งกราฟ
 *
 * `minSpan` = ความกว้างต่ำสุดของแกน — ค่านิ่งๆ (เช่นเซนเซอร์ดินค้างที่ 99%) ถ้าไม่กำหนดไว้
 * จะถูกซูมจนช่วงแกนกว้าง 0.4% แล้วสัญญาณรบกวนเล็กน้อยดูเหมือนความเปลี่ยนแปลงใหญ่โต
 */
export const METRIC_LIMITS: Readonly<
  Record<MetricKey, { readonly min: number; readonly max: number; readonly minSpan: number }>
> = {
  soil: { min: 0, max: 100, minSpan: 10 },
  temp: { min: 0, max: 60, minSpan: 4 },
  hum: { min: 0, max: 100, minSpan: 10 },
  light: { min: 0, max: 150, minSpan: 2 },
};

/** ช่วงค่าเหมาะสมที่วาดเป็นแถบเขียวบนกราฟ */
export const TARGET_BANDS: Readonly<Record<MetricKey, readonly [number, number]>> = {
  soil: [30, 60],
  temp: [22, 32],
  hum: [55, 75],
  light: [30, 60],
};

/**
 * รูปคลื่นเฉพาะของแต่ละค่า — **ต้องต่างกันจริง** ไม่งั้นในโหมด "ทุกค่ารวม" ที่ normalize
 * แต่ละเส้นตามช่วงตัวเอง เส้นที่ใช้คลื่นเดียวกันจะทับกันสนิทจนเห็นเป็นเส้นเดียว
 *
 * เดิม temp/hum/light ใช้ `noise` ก้อนเดียวกัน → 3 เส้นทับกัน เห็นแค่ 2 เส้น (รวม soil)
 * จึงให้แต่ละค่ามีความถี่/เฟสของตัวเอง (deterministic ล้วน ไม่มี Math.random)
 */
const WAVE: Readonly<Record<MetricKey, { readonly freq: number; readonly phase: number }>> = {
  temp: { freq: 0.8, phase: 0 },
  hum: { freq: 0.55, phase: 1.7 },
  soil: { freq: 0.9, phase: 3.1 },
  light: { freq: 1.15, phase: 4.6 },
};

/**
 * ชุดข้อมูลจำลอง — deterministic ล้วน (ไม่มี Math.random)
 * ค่าดินของโซน B ค้างที่ 24% ในช่วงท้าย สื่อว่าเซนเซอร์ไม่ขยับ
 */
/** ช่วงเวลาย้อนหลังของแต่ละ range (ms) — ใช้คำนวณป้ายเวลาต่อจุดบน tooltip */
const RANGE_SPAN_MS: Readonly<Record<RangeKey, number>> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

/**
 * ป้ายเวลา/ช่วงเวลาของจุดที่ `index` (0..count-1) — อิงเวลาปัจจุบันย้อนหลังตามช่วงที่เลือก
 * (จุดสุดท้าย = ตอนนี้ · จุดแรก = ต้นช่วง) · รูปแบบต่างกันตาม range ให้อ่านง่าย
 *   ชม./วัน → HH:mm · สัปดาห์ → "อา. HH:mm" · เดือน → "12 ส.ค." · ปี → "ส.ค."
 * เขตเวลาไทยเสมอ (ตรงกับนาฬิกา HUD) · รับ `now` เข้ามาได้เพื่อให้เทสกำหนดเวลาแน่นอน
 */
export function pointTimeLabel(
  index: number,
  count: number,
  range: RangeKey,
  lang: string,
  now: Date = new Date(),
): string {
  const step = count > 1 ? RANGE_SPAN_MS[range] / (count - 1) : 0;
  const d = new Date(now.getTime() - (count - 1 - index) * step);
  const loc = lang === 'th' ? 'th-TH' : 'en-US';
  const opt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(loc, { timeZone: 'Asia/Bangkok', ...o }).format(d);
  switch (range) {
    case 'hour':
    case 'day':
      return opt({ hour: '2-digit', minute: '2-digit', hour12: false });
    case 'week':
      return `${opt({ weekday: 'short' })} ${opt({ hour: '2-digit', minute: '2-digit', hour12: false })}`;
    case 'month':
      return opt({ day: 'numeric', month: 'short' });
    case 'year':
      return opt({ month: 'short' });
  }
}

export function seriesFor(metric: MetricKey, range: RangeKey): number[] {
  const n = RANGE_POINTS[range];
  const cfg = METRIC_CFG[metric];
  const w = WAVE[metric];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (metric === 'soil') {
      out.push(i > n - 4 ? 24 : cfg.base + Math.sin(i * w.freq + w.phase) * 3 + 4);
      continue;
    }
    const noise = Math.sin(i * w.freq + w.phase) * 0.55 + Math.sin(i * (w.freq * 2.6) + 1) * 0.3;
    out.push(cfg.base + noise * cfg.amp);
  }
  return out;
}

export type Pt = readonly [number, number];

/**
 * เส้นโค้งนุ่มแบบ Catmull-Rom → Bézier
 * `close` = ปิดรูปลงไปที่เส้นฐานเพื่อระบายพื้นที่ใต้กราฟ
 */
export function smoothPath(pts: readonly Pt[], close = false, bottom = 0): string {
  if (pts.length < 2) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return '';

  const cmds = [`M${first[0].toFixed(2)},${first[1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    cmds.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(
        2,
      )},${p2[1].toFixed(2)}`,
    );
  }
  if (close) {
    cmds.push(`L${last[0].toFixed(2)},${bottom} L${first[0].toFixed(2)},${bottom} Z`);
  }
  return cmds.join(' ');
}

/** ชุดข้อมูลของ "ช่วงก่อนหน้า" ที่ใช้เทียบ */
export const previousSeries = (arr: readonly number[]): number[] =>
  arr.map((v, i) => v - (Math.sin(i * 1.3) * 1.5 + 2));

/** แปลงชุดข้อมูลเป็น CSV — ใช้กับปุ่มดาวน์โหลดที่ทำงานจริง */
export function toCsv(metric: string, values: readonly number[]): string {
  const rows: (string | number)[][] = [['index', metric]];
  values.forEach((v, i) => rows.push([i, Math.round(v * 100) / 100]));
  return rows.map((r) => r.join(',')).join('\n');
}

export const csvFilename = (metric: string, range: string): string =>
  `syntech-${metric}-${range}.csv`;
