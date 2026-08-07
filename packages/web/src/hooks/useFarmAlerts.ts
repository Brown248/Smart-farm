import { useMemo } from 'react';
import type { AlarmRecord, AlarmSeverity } from '@shared/telemetrySocket';
import { DASH_COLOR, NOTIFICATIONS } from '@/data/dashboard';
import { deriveSensorAlerts } from '@/lib/farmAlerts';
import type { AlertMetric } from '@/lib/farmAlerts';
import { deviceName } from '@/lib/deviceLabel';
import { useThresholds } from '@/hooks/useThresholds';
import { useFarmState } from '@/state/FarmStateProvider';
import { useI18n } from '@/i18n/useI18n';
import type { Dict, TextKey } from '@/i18n/keys';

/**
 * รายการแจ้งเตือนที่หน้าจอแสดง — **อิงค่าจริงเมื่อต่อจริง · ใช้ mock เมื่อ token หมด/ยังไม่ล็อกอิน**
 *
 * ตอบโจทย์ "แจ้งเตือนปัญหาต้องอิงข้อมูลจริง เท่านั้น" — พอ `live` แจ้งเตือนมาจากค่าเซนเซอร์จริง
 * ที่หลุดเกณฑ์ (`deriveSensorAlerts`) ไม่ใช่ข้อความฝังไว้ · พอหลุด live ก็กลับไปใช้ `NOTIFICATIONS`
 *
 * ป้าย pill/การ์ดใช้ค่าจริงเมื่อ live อยู่แล้ว ตัวนี้ทำให้ "กระดิ่งแจ้งเตือน" สอดคล้องกัน
 */
export interface AlertItem {
  readonly id: string;
  readonly text: string;
  readonly time: string;
  readonly color: string;
  readonly level: 'warn' | 'crit';
}

/** ชื่อ + หน่วยของแต่ละค่า — ใช้ประกอบข้อความเตือน */
const METRIC_META: Readonly<
  Record<AlertMetric, { labelKey: TextKey; unit: string; digits: number }>
> = {
  temp: { labelKey: 'senTemp', unit: '°C', digits: 1 },
  rh: { labelKey: 'senHum', unit: '%', digits: 0 },
  lux: { labelKey: 'senLight', unit: ' k lux', digits: 1 },
  soil: { labelKey: 'senSoil', unit: '%', digits: 0 },
};

export interface FarmAlerts {
  readonly items: readonly AlertItem[];
  readonly count: number;
  /** แจ้งเตือนวิกฤตที่ร้ายแรงสุด — เอาไปขึ้นแบนเนอร์ (null ถ้าไม่มี) */
  readonly topCritical: AlertItem | null;
  /** แจ้งเตือนมาจากค่าจริงไหม — ใช้แยกว่าจะโชว์แบนเนอร์จริงหรือ mock */
  readonly isLive: boolean;
}

function alertText(metric: AlertMetric, dir: 'high' | 'low', value: number, t: Dict): string {
  const meta = METRIC_META[metric];
  const valueStr = value.toFixed(meta.digits) + meta.unit;
  const label = t[meta.labelKey];
  return dir === 'high' ? t.alertHi(label, valueStr) : t.alertLo(label, valueStr);
}

/** ระดับ alarm ของ ThingsBoard → warn/crit ของหน้าจอ */
function alarmLevel(severity: AlarmSeverity): 'warn' | 'crit' {
  return severity === 'CRITICAL' || severity === 'MAJOR' ? 'crit' : 'warn';
}

/**
 * แจ้งเตือน backend ที่ยัง "ทำงานอยู่" เท่านั้น — CLEARED แล้วไม่ต้องโชว์
 * (`status` ขึ้นต้นด้วย `ACTIVE` = ยังไม่หาย)
 */
function activeAlarms(alarms: readonly AlarmRecord[]): readonly AlarmRecord[] {
  return alarms.filter((a) => a.status.startsWith('ACTIVE'));
}

function alarmItems(alarms: readonly AlarmRecord[], t: Dict): AlertItem[] {
  return activeAlarms(alarms).map((a) => {
    const level = alarmLevel(a.severity);
    return {
      id: `alarm-${a.entityId.id}-${a.createdTime}`,
      text: a.type,
      time: t.alarmFrom(a.originatorName),
      color: DASH_COLOR[level],
      level,
    };
  });
}

export function useFarmAlerts(): FarmAlerts {
  const { t } = useI18n();
  const { climate, zones, devices, live, notifPrefs } = useFarmState();
  const { thresholds } = useThresholds();
  const alarms = live.alarms;

  const soil = live.fields.has('soil') ? (zones[0]?.soil ?? null) : null;
  const liveFields = live.fields;
  // ต่อจริง = ใช้แจ้งเตือนจริง (แม้ยังไม่มี field ไหนแมตช์ ก็คือ "ต่อแล้ว ไม่มีปัญหา" ไม่ใช่ mock)
  const isLive = live.status === 'live';

  return useMemo(() => {
    if (!isLive) {
      // ยังไม่ต่อจริง → ใช้ข้อความ mock เดิม (fallback ตามกฎ)
      const items: AlertItem[] = NOTIFICATIONS.map((n) => ({
        id: n.titleKey,
        text: t[n.titleKey],
        time: t[n.timeKey],
        color: n.color,
        level: 'warn' as const,
      }));
      return { items, count: items.length, topCritical: null, isLive: false };
    }

    /*
     * กรองตามหมวดที่ผู้ใช้เปิดไว้ (สวิตช์ในลิ้นชักโซน) — ผูกกับ alert ที่มีจริง:
     *   soil → หมวด `soil` · temp/rh/lux → หมวด `climate`
     */
    const derived: AlertItem[] = deriveSensorAlerts(climate, soil, thresholds.soil, liveFields)
      .filter((a) => (a.metric === 'soil' ? notifPrefs.soil : notifPrefs.climate))
      .map((a) => ({
        id: a.id,
        text: alertText(a.metric, a.dir, a.value, t),
        time: t.alertNow,
        color: DASH_COLOR[a.level],
        level: a.level,
      }));

    // แจ้งเตือนอุปกรณ์หลุดการเชื่อมต่อ (หมวด `device`) — อุปกรณ์ที่ online=false ขณะต่อจริง
    const offline: AlertItem[] = notifPrefs.device
      ? devices
          .filter((d) => !d.online)
          .map((d) => ({
            id: `offline-${d.id}`,
            text: t.alertDeviceOffline(deviceName(d, t)),
            time: t.alertNow,
            color: DASH_COLOR.warn,
            level: 'warn' as const,
          }))
      : [];

    /*
     * แจ้งเตือนจาก backend (ThingsBoard alarm rule) มาก่อนแจ้งเตือนที่เราคำนวณเอง
     * เพราะเป็นกฎที่ทีมตั้งไว้ตั้งใจ (authoritative) — แต่ตอนนี้ยังไม่มีใครตั้ง จึงว่างไว้ก่อน
     * วิกฤตของทั้งสองแหล่งขึ้นก่อนเสมอ
     */
    const items = [...alarmItems(alarms, t), ...derived, ...offline].sort((a, b) =>
      a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1,
    );
    const topCritical = items.find((i) => i.level === 'crit') ?? null;
    return { items, count: items.length, topCritical, isLive: true };
  }, [isLive, climate, soil, liveFields, thresholds.soil, alarms, devices, notifPrefs, t]);
}
