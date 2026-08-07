/**
 * ตรรกะ "ดูดอากาศออกตามความชื้น" — pure function เพื่อเทสได้แน่นอน
 *
 * ออกแบบให้ **ประหยัดไฟ** (จุดที่กินไฟเปล่าสุดคือพัดลมเปิด-ปิดถี่ = short-cycle):
 *   1. hysteresis — เปิดเมื่อ RH > onAt · ปิดเมื่อ RH < offAt (ช่องว่างกันสั่นรอบเกณฑ์)
 *   2. เวลาขั้นต่ำ — เปิดแล้วต้องเดินอย่างน้อย MIN_RUN · ปิดแล้วพักอย่างน้อย MIN_OFF
 *   3. ทยอยเปิด — เริ่มพัดลมใหญ่ #1 ก่อน · ยังชื้นเกิน STAGE_DELAY ค่อยเสริม #2
 *   4. ตัดเวลาสูงสุด — เปิดต่อเนื่องเกิน MAX_RUN แล้วยังไม่ลง = พัก REST (ดูดไม่ลง=นอกก็ชื้น)
 *
 * engine ตัวจริงอยู่ที่ `FarmStateProvider` (เรียก `nextVent` ทุก tick แล้วสั่ง relay ตาม stage)
 */
import {
  HUM_MAX_RUN_MS,
  HUM_MIN_OFF_MS,
  HUM_MIN_RUN_MS,
  HUM_REST_MS,
  HUM_STAGE_DELAY_MS,
} from './deviceTiming';

/** 0 = ปิด · 1 = พัดลมใหญ่ #1 (+เล็กพ่วง) · 2 = ใหญ่ #1 + #2 */
export type VentStage = 0 | 1 | 2;

export interface VentState {
  readonly stage: VentStage;
  /** เวลาที่ stage เปลี่ยนล่าสุด (ms) — ใช้กับ MIN_RUN/MIN_OFF */
  readonly changedAt: number;
  /** เวลาที่เริ่มดูดรอบนี้ (0→1) — ใช้กับ STAGE_DELAY และ MAX_RUN */
  readonly ventStartedAt: number;
  /** ห้ามเปิดจนกว่าจะถึงเวลานี้ (หลังตัดเวลาสูงสุด) */
  readonly restUntil: number;
}

export interface VentInput {
  readonly enabled: boolean;
  /** โหมดจริง + เชื่อมต่อ (สั่ง relay จริงได้) */
  readonly live: boolean;
  readonly estop: boolean;
  /** ความชื้นอากาศจริง (%) · `null` = ไม่มีเซนเซอร์จริง → ไม่สั่ง */
  readonly rh: number | null;
  readonly onAt: number;
  readonly offAt: number;
  readonly inWindow: boolean;
  readonly now: number;
}

export const INITIAL_VENT_STATE: VentState = {
  stage: 0,
  changedAt: 0,
  ventStartedAt: 0,
  restUntil: 0,
};

/** ป้ายเวลา "HH:mm" → นาทีตั้งแต่เที่ยงคืน */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** นาทีตั้งแต่เที่ยงคืน (เขตเวลาไทย) — ให้ตรงกับนาฬิกา HUD ไม่ใช่เวลาเครื่องผู้ใช้ */
function bangkokMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/**
 * อยู่ในช่วงเวลาที่อนุญาตให้ดูดไหม (เขตเวลาไทย)
 * · start===end = ทั้งวัน
 * · start<end  = ช่วงปกติในวันเดียว (เช่น 05:00–18:00)
 * · start>end  = ข้ามเที่ยงคืน (เช่น 20:00–06:00) — เคสหลักของการดูดกลางคืน
 *   เดิมคืน false เงียบๆ → ผู้ใช้ตั้งช่วงกลางคืนแล้วพัดลมไม่ทำงานโดยไม่มีสาเหตุ (บั๊ก)
 */
export function inTimeWindow(now: Date, start: string, end: string): boolean {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === b) return true;
  const cur = bangkokMinutes(now);
  if (a < b) return cur >= a && cur < b;
  return cur >= a || cur < b; // ข้ามเที่ยงคืน
}

/**
 * คำนวณ stage ถัดไป — เรียกทุก tick · คืน stage ที่ต้องการ + state ใหม่ (ให้ engine เก็บต่อ)
 * pure ล้วน (ไม่มี side effect / ไม่อ่านนาฬิกาเอง) → เทสได้แน่นอน
 */
export function nextVent(
  prev: VentState,
  input: VentInput,
): { stage: VentStage; state: VentState } {
  const { enabled, live, estop, rh, onAt, offAt, inWindow, now } = input;
  const prevStage = prev.stage;

  const to = (stage: VentStage): { stage: VentStage; state: VentState } => ({
    stage,
    state: {
      stage,
      changedAt: stage !== prevStage ? now : prev.changedAt,
      ventStartedAt: stage >= 1 ? (prevStage < 1 ? now : prev.ventStartedAt) : 0,
      restUntil: prev.restUntil,
    },
  });

  // 1) ปิดทันที: ปิดระบบ / ไม่ใช่โหมดจริง / estop / ไม่มีค่าจริง / นอกช่วงเวลา
  if (!enabled || !live || estop || rh === null || !inWindow) return to(0);

  // 2) ช่วงพักหลังตัดเวลาสูงสุด — ห้ามเปิดซ้ำ
  if (now < prev.restUntil) return to(0);

  // 3) ตัดเวลาสูงสุด: เปิดต่อเนื่องเกิน MAX_RUN → ปิด + ตั้งช่วงพัก
  if (prevStage >= 1 && now - prev.ventStartedAt >= HUM_MAX_RUN_MS) {
    return {
      stage: 0,
      state: { stage: 0, changedAt: now, ventStartedAt: 0, restUntil: now + HUM_REST_MS },
    };
  }

  // 4) state machine: hysteresis + เวลาขั้นต่ำ + ทยอยเปิด
  if (prevStage === 0) {
    if (rh > onAt && now - prev.changedAt >= HUM_MIN_OFF_MS) return to(1);
    return to(0);
  }
  if (prevStage === 1) {
    if (rh < offAt && now - prev.changedAt >= HUM_MIN_RUN_MS) return to(0);
    if (rh > onAt && now - prev.ventStartedAt >= HUM_STAGE_DELAY_MS) return to(2);
    return to(1);
  }
  // prevStage === 2
  if (rh < offAt && now - prev.changedAt >= HUM_MIN_RUN_MS) return to(0);
  if (rh <= onAt && now - prev.changedAt >= HUM_MIN_RUN_MS) return to(1);
  return to(2);
}
