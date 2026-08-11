import type { ZoneReading } from '@shared/zone';
import type { Dict } from '@/i18n/keys';
import type { HudCard } from './status';

export const AGENT_POSES = [
  'happy',
  'pointing',
  'warning',
  'curious',
  'watering',
  'celebration',
  'loading',
  'idea',
  'greeting',
] as const;
export type AgentPose = (typeof AGENT_POSES)[number];

/** แมป 9 ท่า → ไฟล์ภาพ */
export const POSE_SRC: Readonly<Record<AgentPose, string>> = {
  happy: '/assets/agent/HAPPY.png',
  pointing: '/assets/agent/POINTING-ALERT.png',
  warning: '/assets/agent/GREENHOUSE-WARNING.png',
  curious: '/assets/agent/CURIOUS.png',
  watering: '/assets/agent/WATERING.png',
  celebration: '/assets/agent/CELEBRATION.png',
  loading: '/assets/agent/LOADING.png',
  idea: '/assets/agent/IDEA.png',
  greeting: '/assets/agent/GREETING.png',
};

/** animation ตอนเปลี่ยนท่า — celebration กระโดด, เตือน/ชี้ สั่น, ที่เหลือ fade เข้า */
export function poseEntryAnimation(pose: AgentPose): string {
  if (pose === 'celebration') return 'fsPoseIn .35s ease, fsHop .9s ease .1s';
  if (pose === 'pointing' || pose === 'warning') return 'fsPoseIn .35s ease, fsShake .5s ease .15s';
  return 'fsPoseIn .35s ease';
}

export interface AgentContext {
  readonly estop: boolean;
  /** มีอุปกรณ์ตัวใดกำลังรอผลคำสั่งอยู่ */
  readonly busy: boolean;
  readonly presentation: boolean;
  readonly zones: readonly ZoneReading[];
  readonly climateBad: HudCard | undefined;
  readonly rain: boolean;
  /** ความชื้นอากาศที่ใช้ตัดสินใจ (ค่าเดียวกับที่ HUD ใช้) */
  readonly rh: number;
  readonly night: boolean;
  readonly t: Dict;
  /** ชื่อโซนพร้อมคำนำหน้า ("โซน…" ในภาษาไทย, ไม่มีคำนำหน้าในอังกฤษ) */
  readonly zoneName: (z: ZoneReading) => string;
}

export interface AgentState {
  readonly pose: AgentPose;
  readonly message: string;
  readonly sleeping: boolean;
}

/**
 * ลำดับความสำคัญของข้อความ agent — พอร์ตตรงจากต้นแบบ ห้ามสลับลำดับ
 *
 *   estop → busy → presentation → critical → rain → climate → low → watering → night → allGreen
 *
 * หมายเหตุ: สเปกข้อ 0.2 เขียนลำดับเป็น "… critical → climate → rain → low …"
 * แต่ต้นแบบตรวจ rain ก่อน climate → ยึดต้นแบบตามกฎข้อ 0.1
 */
export function pickAgent(ctx: AgentContext): AgentState {
  const { t, zoneName } = ctx;

  if (ctx.estop) return { pose: 'warning', message: t.aEstop, sleeping: false };
  if (ctx.busy) return { pose: 'loading', message: t.aBusy, sleeping: false };
  if (ctx.presentation) return { pose: 'celebration', message: t.aPres, sleeping: false };

  const badZone =
    ctx.zones.find((z) => z.status === 'critical') ?? ctx.zones.find((z) => z.status === 'low');

  if (badZone && badZone.status === 'critical') {
    return {
      pose: 'pointing',
      message: t.aCrit(zoneName(badZone), Math.round(badZone.soil)),
      sleeping: false,
    };
  }
  if (ctx.rain && ctx.rh > 80) return { pose: 'idea', message: t.aRain, sleeping: false };
  if (ctx.climateBad) {
    const c = ctx.climateBad;
    return { pose: 'warning', message: t.aClimate(c.label, c.value, c.note), sleeping: false };
  }
  if (badZone) {
    return {
      pose: 'curious',
      message: t.aLow(zoneName(badZone), Math.round(badZone.soil)),
      sleeping: false,
    };
  }
  if (ctx.night) return { pose: 'happy', message: t.aNight, sleeping: true };
  // ทุกอย่างปกติ = หมีโบกมือทักทาย (นวลกว่าท่ากระโดดฉลอง · celebration เก็บไว้ตอนโหมดนำเสนอ)
  return { pose: 'greeting', message: t.aAllGreen, sleeping: false };
}
