import type { TelemetryValue } from '@shared/telemetrySocket';

/**
 * ผลตอบกลับของคำสั่งล่าสุดจากอุปกรณ์ (`cmd_result`)
 *
 * device ยิง key นี้มาเป็น **JSON string** ทุกครั้งที่มีคำสั่ง (ไม่ใช่ heartbeat ต่อเนื่อง)
 * เอาไว้รู้ว่า "ช่องสั่งงานอุปกรณ์ยังตอบสนองไหม" และคำสั่งล่าสุดสำเร็จหรือไม่
 *
 * โครงสร้างยึดจาก payload จริงที่ capture มา (กฎ #1: ห้ามเดา field เอง):
 *   สำเร็จ  → `{"ok":true,"channel":3,"reqId":"t1"}`
 *   ล้มเหลว → `{"ok":false,"channel":2,"error":"...","reqId":"t2"}`  (ผูกกับคำสั่งจริง — มี reqId/channel)
 *
 * 🔴 ระวัง "ขยะ": `{"ok":false,"action":"","error":"unknown error","reqId":"","publishedCount":0}`
 *   = backend ปัดตกคำสั่งผิดรูป (เช่น payload ลบตารางที่ backend ไม่รับ) แล้ว **retain ค้างบนสตรีม**
 *   ไม่มี reqId/channel = ผูกกับคำสั่งไหนไม่ได้ → **ไม่ถือเป็นผลคำสั่ง** (ไม่งั้นหน้าโรงเรือนโชว์
 *   "คำสั่งล่าสุดล้มเหลว" ค้างทั้งที่ไม่มีใครสั่งอะไรพลาด) — parseCommandResult คืน null ทิ้ง
 */
export const COMMAND_RESULT_KEY = 'cmd_result';

export interface CommandResult {
  /** คำสั่งล่าสุดสำเร็จไหม — field เดียวที่มีเสมอทั้งสองแบบ */
  readonly ok: boolean;
  /** เวลาที่ device ตอบกลับ (ms epoch) — จาก `timestamp` ของ telemetry */
  readonly at: number;
  /** ข้อความ error (เมื่อ `ok:false`) */
  readonly error?: string;
  /** ช่อง relay ที่สั่ง (เมื่อ `ok:true`) */
  readonly channel?: number;
  /** id คำขอ — เอาไว้จับคู่กับคำสั่งที่ส่งไป */
  readonly reqId?: string;
  /**
   * 🔴 เกิดเฉพาะ `setThreshold` (ส่ง 4 ค่าเรียงกัน พลาดกลางทาง) — **อุปกรณ์ค้างในค่าที่ไม่มีใครตั้งใจ**
   * ต้องเตือนผู้ใช้ให้แรง ไม่ใช่ error ธรรมดา และให้กดส่งซ้ำ (เอกสารข้อ 4.1)
   * เก็บเฉพาะตอน `true` (ค่าปกติ `false` ไม่ต้องรก) · คู่กับ `publishedCount` = ส่งไปได้กี่ค่าจาก 4
   */
  readonly partial?: true;
  readonly publishedCount?: number;
}

/**
 * แปลงค่า `cmd_result` (string) → object ที่อ่านได้ · คืน `null` ถ้าอ่านไม่ออก/ไม่มี `ok`
 *
 * ต้องกัน string ที่พังหรือไม่ใช่ JSON — device อาจส่งอะไรแปลกๆ มา ห้ามให้ทั้งหน้าล้ม
 */
export function parseCommandResult(
  value: string | null | undefined,
  at: number,
): CommandResult | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['ok'] !== 'boolean') return null;

  const reqId = typeof r['reqId'] === 'string' && r['reqId'] !== '' ? r['reqId'] : undefined;
  const channel = typeof r['channel'] === 'number' ? r['channel'] : undefined;
  const isPartial = r['partial'] === true;
  // ผลที่ผูกกับคำสั่งจริงไม่ได้ (ไม่มี reqId · ไม่มี channel · ไม่ใช่ partial) = ขยะจาก backend ปัดตกคำสั่งผิดรูป
  // ที่ retain ค้างบนสตรีม (`{"ok":false,"reqId":"","action":""}`) → ทิ้ง ไม่งั้นโชว์ "ล้มเหลว" ค้างถาวร
  if (r['ok'] === false && reqId === undefined && channel === undefined && !isPartial) return null;

  const out: CommandResult = { ok: r['ok'], at };
  // partial เก็บเฉพาะตอน true (กรณีอันตราย) พร้อม publishedCount — ค่าปกติ partial:false ไม่เก็บ
  const partial =
    r['partial'] === true
      ? {
          partial: true as const,
          ...(typeof r['publishedCount'] === 'number'
            ? { publishedCount: r['publishedCount'] }
            : {}),
        }
      : {};
  return {
    ...out,
    ...(typeof r['error'] === 'string' ? { error: r['error'] } : {}),
    ...(channel !== undefined ? { channel } : {}),
    ...(reqId !== undefined ? { reqId } : {}),
    ...partial,
  };
}

/** อ่านจาก telemetry ทั้งก้อน — สะดวกตอนเรียกใน provider */
export function readCommandResult(
  live: Readonly<Record<string, TelemetryValue>>,
): CommandResult | null {
  const cr = live[COMMAND_RESULT_KEY];
  return cr ? parseCommandResult(cr.value, cr.timestamp) : null;
}
