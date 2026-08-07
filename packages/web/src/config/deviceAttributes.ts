/**
 * อ่านสถานะจริงของอุปกรณ์จาก attributes (เอกสารข้อ 7)
 *
 * ระบบอ่านค่าจากอุปกรณ์จริงทุก 10 วินาทีแล้วเขียนลง attributes —
 * **อ่านจากที่นี่เท่านั้น ห้ามเอาคำสั่งที่เพิ่งส่งไปแสดงเป็นสถานะ** (จุดพลาดอันดับ 5)
 *
 * ค่าใน attributes เป็น **string ทุกตัว** → แปลงด้วย telemetryNumber/telemetryBoolean
 * mode auto/no-auto **ไม่มี field ตรงๆ ต้อง derive จากค่าจริงทุกครั้ง** (เอกสารข้อ 7)
 * ถ้าเก็บ mode ไว้เอง วันที่เจ้าของระบบปรับจากแอปมือถือ หน้าจอเราจะโกหก
 */
import { telemetryBoolean, telemetryNumber, type TelemetryValue } from '@shared/telemetrySocket';
import { HS_DAY_KEYS, HS_MAX_SLOT, type HsChannel, type HsDays } from '@shared/handysense';

export type Attributes = Readonly<Record<string, TelemetryValue>>;

/**
 * ชื่อ attribute ที่แอปต้องขอ subscribe (SHARED_SCOPE) — **ต้องระบุล่วงหน้า** ไม่งั้น backend ไม่ส่ง
 * (เคยพลาด: provider subscribe แบบไม่ใส่ attributeKeys → ไม่เคยได้ led/เกณฑ์/timer เลย
 *  สวิตช์เลยค้างที่ค่า mock · กดปิดแล้วเด้งกลับ · ตัวแก้โชว์ค่า default ปลอม)
 * ครอบ channel 0-2 (พัดลมจริง · ch3 เป็น test ไม่ได้ใช้บนจอ)
 */
export const HS_ATTRIBUTE_KEYS: readonly string[] = (() => {
  const keys: string[] = ['shadow_ts'];
  for (let c = 0; c <= 2; c++) {
    keys.push(
      `led${c}`,
      `min_temp${c}`,
      `max_temp${c}`,
      `min_soil${c}`,
      `max_soil${c}`,
      `saved_min_temp${c}`,
      `saved_max_temp${c}`,
      `saved_min_soil${c}`,
      `saved_max_soil${c}`,
    );
    for (let s = 0; s <= 2; s++) keys.push(`timer${c}${s}`);
  }
  return keys;
})();

export interface HsBandState {
  /** มี automation ทำงานอยู่ไหม = ไม่ใช่ (min===0 && max===0) */
  readonly on: boolean;
  readonly min: number | null;
  readonly max: number | null;
}

export interface HsTimerState {
  readonly slot: number;
  readonly enable: boolean;
  readonly days: HsDays | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
}

export interface HsChannelState {
  readonly channel: HsChannel;
  /** led{c} · `null` = ยังไม่มีค่ารายงานมา */
  readonly on: boolean | null;
  readonly temp: HsBandState;
  readonly soil: HsBandState;
  /** derive: (tempOn || soilOn) ? 'auto' : 'no-auto' */
  readonly mode: 'auto' | 'no-auto';
  readonly timers: readonly HsTimerState[];
  /** ค่าเดิมก่อนปิด automation — ใช้เติมฟอร์มตอนเปิดกลับ (FE แค่อ่าน) */
  readonly savedTemp: { readonly min: number | null; readonly max: number | null };
  readonly savedSoil: { readonly min: number | null; readonly max: number | null };
}

const num = (attrs: Attributes, key: string): number | null => telemetryNumber(attrs[key]?.value);

/** band เปิดอยู่ = ไม่ใช่ (0,0) · ถ้ายังไม่มีค่าเลยถือว่าปิด */
function readBand(attrs: Attributes, kind: 'temp' | 'soil', c: number): HsBandState {
  const min = num(attrs, `min_${kind}${c}`);
  const max = num(attrs, `max_${kind}${c}`);
  const on = !((min === 0 || min === null) && (max === 0 || max === null));
  return { on, min, max };
}

function readTimer(attrs: Attributes, c: number, slot: number): HsTimerState | null {
  const raw = attrs[`timer${c}${slot}`]?.value;
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;

  // days: ยอมรับเฉพาะเมื่อครบ 7 key เป็น boolean
  let days: HsDays | null = null;
  if (typeof o['days'] === 'object' && o['days'] !== null) {
    const d = o['days'] as Record<string, unknown>;
    if (HS_DAY_KEYS.every((k) => typeof d[k] === 'boolean')) {
      days = Object.fromEntries(HS_DAY_KEYS.map((k) => [k, d[k] as boolean])) as unknown as HsDays;
    }
  }
  return {
    slot,
    enable: o['enable'] === true,
    days,
    startTime: typeof o['startTime'] === 'string' ? o['startTime'] : null,
    endTime: typeof o['endTime'] === 'string' ? o['endTime'] : null,
  };
}

/** อ่านสถานะครบของ 1 channel จาก attributes */
export function readChannelState(attrs: Attributes, channel: HsChannel): HsChannelState {
  const temp = readBand(attrs, 'temp', channel);
  const soil = readBand(attrs, 'soil', channel);
  const timers: HsTimerState[] = [];
  for (let slot = 0; slot <= HS_MAX_SLOT; slot++) {
    const t = readTimer(attrs, channel, slot);
    if (t) timers.push(t);
  }
  return {
    channel,
    on: telemetryBoolean(attrs[`led${channel}`]?.value),
    temp,
    soil,
    mode: temp.on || soil.on ? 'auto' : 'no-auto',
    timers,
    savedTemp: {
      min: num(attrs, `saved_min_temp${channel}`),
      max: num(attrs, `saved_max_temp${channel}`),
    },
    savedSoil: {
      min: num(attrs, `saved_min_soil${channel}`),
      max: num(attrs, `saved_max_soil${channel}`),
    },
  };
}

/** เวลาที่อุปกรณ์อัปเดตล่าสุด (ms epoch) — ใช้บอกความสด · `null` = ยังไม่มี */
export function readShadowTs(attrs: Attributes): number | null {
  return num(attrs, 'shadow_ts');
}
