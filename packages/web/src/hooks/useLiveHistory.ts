import { useMemo } from 'react';
import { CLIMATE_KEY_RULES, SOIL_ALIASES } from '@/config/telemetryKeys';
import { RANGE_POINTS } from '@/lib/chart';
import type { MetricKey, RangeKey } from '@/lib/chart';
import { resampleHistory } from '@/lib/resampleHistory';
import { useTelemetry } from '@/hooks/useTelemetry';

/**
 * ประวัติค่าจริงสำหรับกราฟ — ขอ `history_data` จาก backend แล้ว resample ให้พอดีช่องเวลา
 *
 * **ทำไมแยก socket จาก provider** — provider subscribe แบบ discovery (ไม่ระบุ key ไม่ขอ history)
 * ส่วนกราฟต้องขอ history ตามช่วงเวลาที่ผู้ใช้เลือก (เปลี่ยน range = ขอชุดใหม่) จึงใช้
 * `useTelemetry` ของตัวเอง · ปิด socket เองตอน unmount (ออกจากหน้าแดชบอร์ด)
 *
 * ยังไม่ล็อกอิน/ยังไม่มี history → คืน `null` ให้กราฟใช้ข้อมูลจำลองต่อ (fallback ตามกฎ)
 */

/** ช่วงเวลาย้อนหลังของแต่ละ range (ms) — ให้ history ครอบคลุมพอสำหรับจำนวนจุดที่กราฟใช้ */
const RANGE_MS: Readonly<Record<RangeKey, number>> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

/** ค่าที่กราฟใช้ → ชื่อ key ที่อยากได้ (ชื่อแรกของ alias — ตรงกับที่ device จริงส่งมา) */
const METRIC_KEY: Readonly<Record<MetricKey, string>> = {
  temp: CLIMATE_KEY_RULES.temp.aliases[0] ?? 'temperature',
  hum: CLIMATE_KEY_RULES.rh.aliases[0] ?? 'humidity',
  light: CLIMATE_KEY_RULES.lux.aliases[2] ?? 'light',
  soil: SOIL_ALIASES[1] ?? 'soil_moisture',
};

const REQUEST_KEYS = Object.values(METRIC_KEY);

export interface LiveHistory {
  /** ค่าจริง resample แล้วต่อ metric — `null` ทั้งก้อนเมื่อยังไม่มีข้อมูลจริง (ใช้ mock แทน) */
  readonly byMetric: Readonly<Partial<Record<MetricKey, readonly number[]>>> | null;
  readonly isLive: boolean;
}

export function useLiveHistory(range: RangeKey): LiveHistory {
  const historyMs = RANGE_MS[range];
  const buckets = RANGE_POINTS[range];

  /*
   * ขอ history ตามช่วงที่เลือก · `historyLimit` เผื่อไว้มากกว่าจำนวนถัง
   * เพื่อให้แต่ละถังมีจุดพอเฉลี่ย (backend คืนมากสุดเท่าที่มี)
   */
  const telemetry = useTelemetry({
    keys: REQUEST_KEYS,
    historyMs,
    historyLimit: Math.max(500, buckets * 20),
    // ไม่รายงานสถานะเข้า pill — ให้ provider (socket หลัก) เป็นเจ้าของป้ายบน header
    reportStatus: false,
  });

  const isLive = telemetry.connectionStatus === 'live';

  return useMemo(() => {
    const endTs = telemetry.lastUpdateAt ?? Date.now();
    const startTs = endTs - historyMs;

    const byMetric: Partial<Record<MetricKey, readonly number[]>> = {};
    let any = false;
    for (const metric of Object.keys(METRIC_KEY) as MetricKey[]) {
      const points = telemetry.history[METRIC_KEY[metric]];
      if (!points || points.length === 0) continue;
      const series = resampleHistory(points, startTs, endTs, buckets);
      if (series === null) continue;
      byMetric[metric] = series;
      any = true;
    }

    return { byMetric: any ? byMetric : null, isLive };
    // ผูกกับ `telemetry.history` ตรงๆ — object ใหม่เมื่อ history_data มาถึงเท่านั้น
  }, [telemetry.history, telemetry.lastUpdateAt, historyMs, buckets, isLive]);
}
