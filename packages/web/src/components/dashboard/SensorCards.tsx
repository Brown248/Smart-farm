import type { LiveField } from '@/config/telemetryKeys';
import { SENSOR_DEFS, SOIL_STUCK_VALUE, levelFor } from '@/data/dashboard';
import type { DashLevel, SensorKey, Threshold } from '@/data/dashboard';
import type { LiveSensors } from '@/hooks/useDashboardData';
import { climateLevel } from '@/lib/status';
import { useLiveSnapshot } from '@/state/liveStatus';
import { useI18n } from '@/i18n/useI18n';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';
import { SensorCard } from './SensorCard';
import type { SensorSource } from './SensorCard';

/**
 * สี/การเตือนของการ์ด — temp/ความชื้น/แสง ต้องเตือน **ทั้งสูงเกินและต่ำเกิน** (ร้อนจัด/ชื้นจัด = อันตราย)
 * จึงใช้ `climateLevel` (ช่วง lo–hi ของ CLIMATE_RANGE) แบบเดียวกับการ์ดฉากเกม + การ์ดโรงเรือน + ระบบแจ้งเตือน
 * ให้สีตรงกันทั้งแอป (เดิมใช้ `levelFor` ทางเดียว → 39°C ยังเขียว ขัดกับแบนเนอร์แจ้งเตือน)
 * ดิน = เตือนทางเดียว (แห้ง = แย่) จึงคง `levelFor` + เกณฑ์ที่ผู้ใช้ตั้งได้
 */
const CLIMATE_KEY_OF = { temp: 'temp', hum: 'rh', light: 'lux' } as const;
function cardLevel(
  key: SensorKey,
  value: number,
  thresholds: Readonly<Record<SensorKey, Threshold>>,
): DashLevel {
  if (key === 'temp' || key === 'hum' || key === 'light') {
    const l = climateLevel(CLIMATE_KEY_OF[key], value);
    return l === 'ok' ? 'normal' : l;
  }
  return levelFor(value, thresholds[key]);
}

/** การ์ดใบไหนอ่านค่าไหนจาก provider — ใช้ตัดสินว่าเลขบนใบนั้นเป็นของจริงหรือจำลอง */
const CARD_FIELD: Readonly<Record<SensorKey, LiveField>> = {
  temp: 'temp',
  hum: 'rh',
  light: 'lux',
  soil: 'soil',
};

/** ค่าที่อ่านได้ของแต่ละเซนเซอร์ และตำแหน่งบนวงแหวน 0–100 */
function readingFor(key: SensorKey, live: LiveSensors): { value: number; percent: number } {
  switch (key) {
    case 'temp':
      return { value: Math.round(live.temp), percent: ((live.temp - 10) / 35) * 100 };
    case 'soil': {
      /*
       * ต้นแบบตั้งใจให้ใบนี้เป็น "เซนเซอร์ค่าค้าง" เพื่อโชว์ปุ่มลองอ่านใหม่
       * แต่พอมีเซนเซอร์ดินจริงแล้ว ค่าค้างจะกลายเป็นเลขปลอมที่ทับค่าจริง
       */
      const soil = live.soil ?? SOIL_STUCK_VALUE;
      return { value: Math.round(soil), percent: soil };
    }
    case 'light':
      return { value: Math.round(live.light), percent: (live.light / 80) * 100 };
    case 'hum':
      return { value: Math.round(live.hum), percent: live.hum };
  }
}

export interface SensorCardsProps {
  readonly live: LiveSensors;
  readonly loading: boolean;
  readonly thresholds: Readonly<Record<SensorKey, Threshold>>;
  readonly onOpenThreshold: (key: SensorKey) => void;
  readonly onRetry: () => void;
  readonly animate: boolean;
}

/** แถวการ์ดค่าเซนเซอร์ 4 ใบ พร้อมโครงกระดูกตอนโหลด */
export function SensorCards({
  live,
  loading,
  thresholds,
  onOpenThreshold,
  onRetry,
  animate,
}: SensorCardsProps) {
  const { t } = useI18n();
  // อุปกรณ์ออฟไลน์/ถูกระงับ → หรี่ค่าเซนเซอร์ (ทุกเลขเป็นค่าค้าง ไม่ใช่ของสด · ทีม backend สั่ง)
  const { deviceStale, deviceBanned } = useLiveSnapshot();
  const dim = !loading && (deviceStale || deviceBanned);

  return (
    <section aria-label={t.realtimeTitle}>
      <div className={s.sectionHead}>
        <h2 className={g.h2}>{t.realtimeTitle}</h2>
        <span className={g.sub}>{t.realtimeSub}</span>
      </div>

      <div className={s.bento} style={dim ? { opacity: 0.5 } : undefined}>
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className={`${g.glass} ${s.senCard}`} aria-hidden="true">
                <div className={s.skelRow}>
                  <div className={g.skel} style={{ width: 30, height: 30, borderRadius: 9 }} />
                  <div className={g.skel} style={{ flex: 1, height: 13 }} />
                </div>
                <div className={s.skelStack}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div className={g.skel} style={{ width: '70%', height: 26 }} />
                    <div className={g.skel} style={{ width: '48%', height: 14 }} />
                  </div>
                  <div className={g.skel} style={{ width: 62, height: 62, borderRadius: '50%' }} />
                </div>
                <div className={g.skel} style={{ height: 28, marginTop: 11 }} />
              </div>
            ))
          : SENSOR_DEFS.map((def) => {
              const { value, percent } = readingFor(def.key, live);
              const isLive = live.liveFields.has(CARD_FIELD[def.key]);
              /*
               * ติดป้ายที่มาเฉพาะตอน "มีของจริงบางส่วน" — ยังไม่ต่ออะไรเลยก็ไม่ต้องแปะ
               * "จำลอง" ทั้ง 4 ใบ เพราะป้ายบน header บอกไว้แล้วว่าทั้งหน้าเป็นข้อมูลจำลอง
               */
              // เซนเซอร์ที่เคยจริงแต่หยุดส่งแล้ว ต้องไม่ถูกเรียกว่า "ค่าจริง" (ดู SENSOR_STALE_MS)
              const isStale = live.staleFields.has(CARD_FIELD[def.key]);
              const source: SensorSource | undefined =
                live.liveFields.size === 0
                  ? undefined
                  : !isLive
                    ? 'sim'
                    : isStale
                      ? 'stale'
                      : 'live';
              /*
               * เส้นแนวโน้มของค่าจริงต้องมาจากค่าจริง — ขอ 3 จุดขึ้นไปก่อนค่อยใช้
               * (2 จุดวาดได้แต่เป็นเส้นตรงเสมอ ดูเหมือนเซนเซอร์นิ่ง ซึ่งเข้าใจผิด)
               */
              const trail = live.trail[CARD_FIELD[def.key]];
              const spark = trail !== undefined && trail.length >= 3 ? trail : def.spark;
              return (
                <SensorCard
                  key={def.key}
                  def={def}
                  // เซนเซอร์ที่ส่งค่ามาจริงไม่ใช่เซนเซอร์ค่าค้าง — ปุ่มลองอ่านใหม่ต้องหายไปด้วย
                  stale={def.stale && !isLive}
                  source={source}
                  spark={spark}
                  value={value}
                  percent={percent}
                  level={cardLevel(def.key, value, thresholds)}
                  secondary={def.key === 'temp' ? `· ${Math.round(live.hum)}% RH` : undefined}
                  animate={animate}
                  onOpenThreshold={() => onOpenThreshold(def.key)}
                  onRetry={onRetry}
                />
              );
            })}
      </div>
    </section>
  );
}
