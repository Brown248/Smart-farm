import type { ClimateValues } from '@shared/sensor';
import { CLIMATE_RANGE } from '@shared/thresholds';
import type { Threshold } from '@/data/dashboard';
import { climateLevel } from '@/lib/status';

/**
 * หาปัญหาจาก **ค่าจริง** — ค่าไหนหลุดเกณฑ์ = แจ้งเตือน
 *
 * ใช้ตอนต่อข้อมูลจริงเท่านั้น (`live`) เพื่อให้ "แจ้งเตือนปัญหา" อิงของจริง ไม่ใช่ข้อความฝังไว้
 * ตอน token หมด/ยังไม่ล็อกอิน → หน้าเพจใช้ `NOTIFICATIONS` (mock) แทน (ดู `useFarmAlerts`)
 *
 * เกณฑ์มาจากที่เดียวกับกราฟ/การ์ด: `CLIMATE_RANGE` (ช่วงเหมาะสม `lo`–`hi`) กับ soil threshold
 * ที่ผู้ใช้ตั้งได้ — ป้ายเตือนจึงตรงกับสีบนการ์ดเสมอ
 */

export type AlertLevel = 'warn' | 'crit';
export type AlertMetric = 'temp' | 'rh' | 'lux' | 'soil';

export interface SensorAlert {
  readonly id: string;
  readonly level: AlertLevel;
  readonly metric: AlertMetric;
  /** ค่าหลุดไปทางสูงหรือต่ำ — ใช้เลือกข้อความ "สูงกว่า/ต่ำกว่าเกณฑ์" */
  readonly dir: 'high' | 'low';
  readonly value: number;
}

/** ดินเปียกเกินระดับนี้ถือว่าผิดปกติ (over-watering) — สูงกว่าช่วงเหมาะสมมาก */
const SOIL_TOO_WET = 90;

const CLIMATE_METRICS = ['temp', 'rh', 'lux'] as const;

export function deriveSensorAlerts(
  climate: ClimateValues,
  soil: number | null,
  soilThreshold: Threshold,
  /** ค่าที่เป็นของจริงตอนนี้ — เตือนเฉพาะค่าจริง ไม่เตือนจากค่าจำลองที่ยังไม่มีเซนเซอร์ */
  liveFields: ReadonlySet<AlertMetric>,
): SensorAlert[] {
  const out: SensorAlert[] = [];

  for (const metric of CLIMATE_METRICS) {
    if (!liveFields.has(metric)) continue;
    const v = climate[metric];
    const level = climateLevel(metric, v);
    if (level === 'ok') continue;
    const dir = v > CLIMATE_RANGE[metric].hi ? 'high' : 'low';
    out.push({ id: `climate-${metric}`, level, metric, dir, value: v });
  }

  if (soil !== null) {
    if (soil < soilThreshold.crit) {
      out.push({ id: 'soil', level: 'crit', metric: 'soil', dir: 'low', value: soil });
    } else if (soil < soilThreshold.warn) {
      out.push({ id: 'soil', level: 'warn', metric: 'soil', dir: 'low', value: soil });
    } else if (soil > SOIL_TOO_WET) {
      out.push({ id: 'soil', level: 'warn', metric: 'soil', dir: 'high', value: soil });
    }
  }

  // วิกฤตขึ้นก่อน แล้วค่อยเตือน — ให้ตัวที่ร้ายแรงสุดอยู่บนสุดของรายการ/แบนเนอร์
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1));
}
