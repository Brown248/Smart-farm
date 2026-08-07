import { SOIL_STUCK_VALUE, levelFor } from '@/data/dashboard';
import type { DashLevel, SensorKey, Threshold } from '@/data/dashboard';
import { climateLevel } from '@/lib/status';
import { CLIMATE_RANGE } from '@shared/thresholds';
import type { IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

/**
 * "สิ่งที่ควรทำตอนนี้" — สร้างจากค่าจริง ไม่ใช่รายการตายตัว
 *
 * ลำดับความเร่งด่วนตัดสินจาก `urgency` (ยิ่งน้อยยิ่งด่วน) แล้วค่อยเรียงเลข 1/2/3 ให้ผู้ใช้
 * ข้อความทุกบรรทัดมาจากพจนานุกรมของต้นแบบ ไม่มีการแต่งประโยคใหม่
 */
export interface Recommendation {
  readonly id: string;
  readonly titleKey: TextKey;
  readonly whyKey: TextKey;
  readonly ctaKey: TextKey;
  readonly icon: IconName;
  readonly level: DashLevel;
  /** โซนที่เกี่ยวข้อง — เติมท้ายเหตุผลให้รู้ว่าไปแปลงไหน */
  readonly zoneLetter?: string;
  /** ยิ่งน้อยยิ่งด่วน (ใช้เรียงลำดับ) */
  readonly urgency: number;
  /** กดแล้วไปหน้าไหน — น้ำ/เซนเซอร์ไปชลประทาน · ร้อน/ชื้นไปคุมพัดลมที่โรงเรือน */
  readonly route: 'irrigation' | 'greenhouse';
}

export const LEVEL_COLOR: Readonly<Record<DashLevel, string>> = {
  normal: 'var(--d-ok)',
  warn: 'var(--d-warn)',
  crit: 'var(--d-crit)',
};

export interface RecommendationInput {
  /** ความชื้นดินที่อ่านได้ (โซน B) */
  readonly soilB: number;
  /** เกณฑ์เตือน/วิกฤตของความชื้นดินที่ผู้ใช้ตั้งไว้ */
  readonly soilThreshold: Threshold;
  /** ดินเป็นค่าจริงไหม — แนะนำรดน้ำจากค่าจริงเท่านั้น ไม่แนะนำจากค่าจำลอง */
  readonly soilLive: boolean;
  /** เซนเซอร์ที่ค่าค้าง (ไม่ขยับ) */
  readonly stuckSensors: readonly SensorKey[];
  /** อุณหภูมิ/ความชื้นอากาศจริง + เป็นค่าจริงไหม (เตือนจากของจริงเท่านั้น) */
  readonly temp: number;
  readonly rh: number;
  readonly tempLive: boolean;
  readonly rhLive: boolean;
}

/**
 * สร้าง "สิ่งที่ควรทำ" จาก **ค่าจริงล้วน** — ไม่มีการ์ด mock/hardcode อีกแล้ว
 * (เดิมยัด prune/harvest ตายตัว + fert จากโซนจำลอง → โชว์เป็นคำแนะนำสดทั้งที่ไม่อิงเซนเซอร์)
 * push เฉพาะ field ที่ live · เรียงตาม urgency (น้อย = ด่วน) · ว่างได้ (RecommendedActions โชว์ "ทุกอย่างปกติ")
 */
export function buildRecommendations(input: RecommendationInput): readonly Recommendation[] {
  const out: Recommendation[] = [];

  // 1. ดินหลุดเกณฑ์ (ค่าจริง) → รดน้ำ — ด่วนสุด
  if (input.soilLive) {
    const soilLevel = levelFor(input.soilB, input.soilThreshold);
    if (soilLevel !== 'normal') {
      out.push({
        id: 'water-b',
        titleKey: 'act1',
        whyKey: 'act1why',
        ctaKey: 'actGo',
        icon: 'soil',
        level: soilLevel,
        urgency: soilLevel === 'crit' ? 0 : 10,
        route: 'irrigation',
      });
    }
  }

  // 2. เซนเซอร์ค่าค้าง → ตรวจก่อนเชื่อค่า
  if (input.stuckSensors.length > 0) {
    out.push({
      id: 'sensor-g',
      titleKey: 'act2',
      whyKey: 'act2why',
      ctaKey: 'actCheck',
      icon: 'chip',
      level: 'crit',
      urgency: 20,
      route: 'irrigation',
    });
  }

  // 3. อุณหภูมิสูงเกินช่วง (ค่าจริง) → ระบายความร้อน/เปิดพัดลม
  if (input.tempLive && input.temp > CLIMATE_RANGE.temp.hi) {
    const crit = climateLevel('temp', input.temp) === 'crit';
    out.push({
      id: 'cool-house',
      titleKey: 'recHeatTitle',
      whyKey: 'recHeatWhy',
      ctaKey: 'actVent',
      icon: 'fan',
      level: crit ? 'crit' : 'warn',
      urgency: crit ? 5 : 15,
      route: 'greenhouse',
    });
  }

  // 4. ความชื้นอากาศสูงเกินช่วง (ค่าจริง) → ดูดอากาศออก
  if (input.rhLive && input.rh > CLIMATE_RANGE.rh.hi) {
    const crit = climateLevel('rh', input.rh) === 'crit';
    out.push({
      id: 'dehumidify',
      titleKey: 'recDampTitle',
      whyKey: 'recDampWhy',
      ctaKey: 'actVent',
      icon: 'drop',
      level: crit ? 'crit' : 'warn',
      urgency: crit ? 8 : 18,
      route: 'greenhouse',
    });
  }

  return [...out].sort((a, b) => a.urgency - b.urgency);
}

/** ค่าเริ่มต้นสำหรับเทส — จำลองสถานการณ์ "ดินแห้ง + ร้อน + ชื้น" (ค่าจริงครบ) */
export const DEFAULT_RECOMMENDATION_INPUT: RecommendationInput = {
  soilB: SOIL_STUCK_VALUE,
  soilThreshold: { warn: 30, crit: 20 },
  soilLive: true,
  stuckSensors: [],
  temp: 39,
  rh: 86,
  tempLive: true,
  rhLive: true,
};
