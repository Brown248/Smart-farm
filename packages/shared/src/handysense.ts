/**
 * ── HandySense control contract ──
 * ถอดตรงจาก `frontend-integration-guide.md` (พี่ทีม backend ส่งมา) · **ห้ามเดา field/ค่าเอง**
 *
 * ภาพรวม 3 ช่องทาง:
 *   ส่งคำสั่ง  POST /devices/{id}/attributes (key ชื่อ cmd) → 200 = รับไว้แล้ว ไม่ใช่สำเร็จ
 *   รับผล     subscribe telemetry key `cmd_result` (JSON string) → มาใน 1-2 วินาที
 *   อ่านสถานะ อ่าน attributes (led0-3 ฯลฯ) → อัปเดตทุก 10 วินาที
 *
 * **ส่งคำสั่ง ≠ รู้ผล** — POST สำเร็จแค่แปลว่า "รับคำสั่งไว้แล้ว" ผลจริงมาทาง cmd_result เท่านั้น
 */

/**
 * channel = หมายเลขสวิตช์นับจาก 0 (ตรงกับ `led0`–`led3` ในอุปกรณ์)
 * ⚠️ ผู้ใช้เห็น "สวิตช์ 1" แต่ payload เป็น `channel: 0` — label นับจาก 1 แต่ส่ง 0
 */
export type HsChannel = 0 | 1 | 2 | 3;
export const HS_CHANNELS: readonly HsChannel[] = [0, 1, 2, 3];

/**
 * channel 3 = **ยังไม่มีการเชื่อมต่ออุปกรณ์จริง ใช้สำหรับ test เท่านั้น**
 * `setSwitch` จะ reject ทันที · `setThreshold`/`setSchedule` ยังส่งได้ (ไว้ทดสอบ)
 * → ห้ามให้ channel 3 โผล่ในหน้า setSwitch ของผู้ใช้
 */
export const HS_TEST_CHANNEL: HsChannel = 3;

/** สูงสุด 3 ตารางเวลาต่อสวิตช์ (slot 0-2) — ห้ามเกิน จะสร้างข้อมูลค้างในอุปกรณ์ที่ลบไม่ได้ตลอดไป */
export const HS_MAX_SLOT = 2;

/** ช่วงค่าที่อุปกรณ์รับ (เอกสารข้อ 6.2) */
export const HS_TEMP_RANGE = { min: 0, max: 60 } as const;
export const HS_SOIL_RANGE = { min: 0, max: 100 } as const;

/** timeout ฝั่ง FE: ไม่มี cmd_result ที่ reqId ตรงภายใน 15 วิ → แสดง "ไม่ทราบผล" (ห้ามหมุนค้าง/ห้ามบอกว่าสำเร็จ) */
export const HS_RESULT_TIMEOUT_MS = 15_000;

export const HS_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type HsDay = (typeof HS_DAY_KEYS)[number];
export type HsDays = Readonly<Record<HsDay, boolean>>;

export type HsAction = 'setSwitch' | 'setThreshold' | 'setSchedule';

/* ───────────── 6.1 setSwitch — เปิด/ปิดสวิตช์เดี๋ยวนี้ ───────────── */
export interface HsSetSwitch {
  readonly action: 'setSwitch';
  /** 0-2 (3 ถูก reject) */
  readonly channel: HsChannel;
  /** boolean แท้ · ห้ามส่ง string `"true"` จะถูก reject */
  readonly on: boolean;
}

/* ───────────── 6.2 setThreshold — ตั้งเกณฑ์ให้อุปกรณ์ทำงานเอง ─────────────
 *
 * 🔴 ทิศทาง min/max กลับกันระหว่าง sensor — label ต้องถูก (จุดพลาดอันดับ 1 · ไม่มี error ให้เห็น):
 *   อุณหภูมิ    : ต่ำกว่า min → ปิด   · สูงกว่า max → เปิด
 *   ความชื้นดิน : ต่ำกว่า min → เปิด   · สูงกว่า max → ปิด
 */
export interface HsThresholdBand {
  readonly enabled: boolean;
  /** ต้องมีเมื่อ enabled=true · min < max */
  readonly min?: number;
  readonly max?: number;
}
export interface HsSetThreshold {
  readonly action: 'setThreshold';
  readonly channel: HsChannel;
  readonly mode: 'auto' | 'no-auto';
  /** 🔴 mode=auto ต้องส่ง temp **และ** soil ครบทุกครั้ง (ปิดตัวไหนส่ง {enabled:false}) · mode=no-auto ห้ามส่งเลย */
  readonly temp?: HsThresholdBand;
  readonly soil?: HsThresholdBand;
}

/* ───────────── 6.3 setSchedule — ตารางเวลา 2 โหมด ─────────────
 * โหมด A (แก้วัน/เวลา): ส่ง days + startTime + endTime
 * โหมด B (pause/resume): ส่งแค่ enable — **ห้ามส่ง days** (กันเวลาที่คนอื่นเพิ่งแก้หาย / กันลบตารางทิ้ง)
 */
export interface HsSetSchedule {
  readonly action: 'setSchedule';
  readonly channel: HsChannel;
  /** 0-2 เท่านั้น */
  readonly slot: number;
  readonly enable: boolean;
  /** โหมด A เท่านั้น · ต้องมีอย่างน้อย 1 วันเป็น true */
  readonly days?: HsDays;
  /** "HH:mm:ss" · ต้องต่างกันและยังไม่รองรับข้ามเที่ยงคืน */
  readonly startTime?: string;
  readonly endTime?: string;
}

export type HsCommand = HsSetSwitch | HsSetThreshold | HsSetSchedule;

/** body ที่ POST ไป `/devices/{id}/attributes` · scope ต้องเป็น SHARED_SCOPE เท่านั้น */
export interface HsAttributesBody {
  readonly scope: 'SHARED_SCOPE';
  readonly attributes: {
    readonly cmd: Record<string, unknown>;
  };
}

/**
 * ประกอบ body จากคำสั่ง + reqId
 * ค่า `undefined` (เช่น temp/soil ตอน no-auto) จะถูก `JSON.stringify` ตัดทิ้งอัตโนมัติ ไม่ถูกส่ง
 */
export function buildAttributesBody(cmd: HsCommand, reqId: string): HsAttributesBody {
  return { scope: 'SHARED_SCOPE', attributes: { cmd: { ...cmd, reqId } } };
}
