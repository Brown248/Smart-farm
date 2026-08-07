import { useMemo, type CSSProperties } from 'react';
import { CropIcon } from '@/components/common/Icon';
import { DASH_BG, DASH_COLOR, DASH_ZONES } from '@/data/dashboard';
import type { DashLevel } from '@/data/dashboard';
import { soilToDashLevel } from '@/data/zoneSoil';
import { useThresholds } from '@/hooks/useThresholds';
import { useFarmState } from '@/state/FarmStateProvider';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

const LEVEL_LABEL: Readonly<Record<DashLevel, TextKey>> = {
  normal: 'lgNormal',
  warn: 'lgWatch',
  crit: 'lgCrit',
};

/**
 * สีของโซนส่งเข้า CSS เป็น custom property ตัวเดียว แล้วให้ CSS จัดการ state ที่เหลือ
 * (hover / focus / แถบความชื้น / ป้ายสถานะ) — ดีกว่ากระจาย inline style เต็มไปหมด
 */
type ZoneVars = CSSProperties & {
  '--zone-color': string;
  '--zone-bg': string;
  /** ความยาวแถบความชื้น — ใส่เฉพาะการ์ดโซน ป้ายสีในหัวข้อไม่ต้องใช้ */
  '--zone-fill'?: string;
};

const levelStyle = (level: DashLevel): ZoneVars => ({
  '--zone-color': DASH_COLOR[level],
  '--zone-bg': DASH_BG[level],
});

const zoneStyle = (level: DashLevel, moisture: number): ZoneVars => ({
  ...levelStyle(level),
  '--zone-fill': Math.max(0, Math.min(100, moisture)) + '%',
});

export interface ZoneStatusStripProps {
  /** ปลายทางยังไม่พร้อม — กดแล้วแจ้งแทนการพาไปหน้าเปล่า */
  readonly irrigationReady: boolean;
  readonly onOpenZone: () => void;
}

/** สถานะย่อทั้ง 8 โซน พร้อมไอคอนพืช */
export function ZoneStatusStrip({ irrigationReady, onOpenZone }: ZoneStatusStripProps) {
  const { t } = useI18n();
  const { zones, live } = useFarmState();
  const { thresholds } = useThresholds();

  /**
   * ความชื้นดินจริงทับค่าที่ฝังใน `DASH_ZONES` — แหล่งเดียวกับการ์ดดินด้านบนและหน้าชลประทาน
   *
   * เดิมแถบนี้อ่าน `DASH_ZONES[].moisture` (48/24/34…) ทำให้บนหน้าเดียวกัน
   * การ์ดดินขึ้นค่าจริงแต่แถบโซนขึ้นค่าฝัง — เลขเดียวกันสองค่า คนดูสับสน
   * ระดับ (สี) คิดจากค่าจริงด้วยเกณฑ์ที่ผู้ใช้ตั้ง เหมือนการ์ดเซนเซอร์
   */
  const zonesToShow = useMemo(() => {
    if (!live.fields.has('soil')) return DASH_ZONES;
    const soilById = new Map(zones.map((z) => [z.id, z.soil]));
    return DASH_ZONES.map((z) => {
      const soil = soilById.get(z.zoneId);
      if (soil === undefined) return z;
      return { ...z, moisture: Math.round(soil), level: soilToDashLevel(soil, thresholds.soil) };
    });
  }, [live.fields, zones, thresholds.soil]);

  return (
    <section className={`${g.glass} ${g.section}`} aria-label={t.zonesTitle}>
      <div className={s.actHead}>
        <h2 className={g.h2}>{t.zonesTitle}</h2>
        <span className={g.sub}>{t.zonesSub}</span>
        <div className={s.legendRow}>
          {(['normal', 'warn', 'crit'] as const).map((lv) => (
            <span key={lv} className={s.legendItem} style={levelStyle(lv)}>
              <span className={s.legendSwatch} aria-hidden="true" />
              {t[LEVEL_LABEL[lv]]}
            </span>
          ))}
        </div>
      </div>

      <div className={s.zoneGrid}>
        {zonesToShow.map((z) => {
          const name = t.zoneLetterPrefix + z.letter;
          const crop = t[z.cropKey];
          const status = t[LEVEL_LABEL[z.level]];
          return (
            <button
              key={z.letter}
              type="button"
              className={`${s.zoneCard} ${z.level !== 'normal' ? s.zoneCardAlert : ''}`}
              data-level={z.level}
              style={zoneStyle(z.level, z.moisture)}
              aria-label={`${name} · ${crop} · ${z.moisture}% · ${status}`}
              onClick={onOpenZone}
              // ปลายทางจริงคือหน้าชลประทาน (เฟส 3) — ตอนนี้ยังไม่พร้อม
              aria-disabled={!irrigationReady}
            >
              <span className={s.zoneTop}>
                <span className={s.zoneCropWrap}>
                  <CropIcon name={z.cropIcon} size={18} color={DASH_COLOR[z.level]} />
                </span>
                <span className={s.zoneHead}>
                  <b className={s.zoneName}>{name}</b>
                  <span className={s.zoneCrop}>{crop}</span>
                </span>
                <span className={`${s.zoneMoist} ${g.num}`}>
                  {z.moisture}
                  <span className={s.zoneMoistUnit}>%</span>
                </span>
              </span>

              {/* แถบความชื้น — ทำให้กวาดตาเทียบ 8 โซนได้ในทีเดียว ไม่ต้องอ่านเลขทีละใบ */}
              <span className={s.zoneBar} aria-hidden="true">
                <span className={s.zoneBarFill} />
              </span>

              <span className={s.zoneTag}>{status}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
