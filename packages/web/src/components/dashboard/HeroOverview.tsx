import { useMemo } from 'react';
import { deviceRunning } from '@shared/device';
import { Donut } from '@/components/charts/Donut';
import { HERO_DOT_COLOR, heroDonut, heroDots } from '@/data/dashboard';
import { useI18n } from '@/i18n/useI18n';
import { useFarmState } from '@/state/FarmStateProvider';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

export interface HeroOverviewProps {
  /** 0→1 ระหว่างตัวเลขนับขึ้นตอนเข้าหน้า */
  readonly progress: number;
}

export function HeroOverview({ progress }: HeroOverviewProps) {
  const { t } = useI18n();
  const { zones, devices } = useFarmState();
  const dots = useMemo(() => heroDots(), []);
  const donut = useMemo(() => heroDonut(), []);
  // ตัวเลขทั้งหมด derive จากสถานะจริง — เลิกใช้ HERO_STATS ที่ฝังเลขปลอม (สุขภาพ 92% · ใช้น้ำ 1240L)
  const total = zones.length;
  const okCount = zones.filter((z) => z.status === 'ok').length;
  const attention = zones.filter((z) => z.status === 'low' || z.status === 'critical').length;
  const health = total ? Math.round((okCount / total) * 100) : 0;
  const devicesOn = devices.filter(deviceRunning).length;
  const at = (n: number) => Math.round(n * progress);

  return (
    <section className={`${s.hero} ${g.lift}`} aria-label={t.heroBadge}>
      <div className={s.heroBlob} aria-hidden="true" />
      <div className={s.heroRow}>
        <div className={s.heroLeft}>
          <div className={s.heroBadge}>{t.heroBadge}</div>
          <div className={s.heroScore}>
            <span className={`${s.heroScoreNum} ${g.num}`}>
              {at(health)}
              <span className={s.heroScoreUnit}>%</span>
            </span>
            <span className={s.heroScoreLabel}>{t.heroHealth}</span>
          </div>
          <div className={s.heroZonesLabel}>{t.heroZones}</div>
          <div className={s.heroDots}>
            {dots.map(([id, kind]) => (
              <span key={id} className={s.heroDot} title={id}>
                <span
                  className={s.heroDotMark}
                  aria-hidden="true"
                  style={{ background: HERO_DOT_COLOR[kind] }}
                />
                {id}
              </span>
            ))}
          </div>
        </div>

        <div className={s.heroRight}>
          <Donut
            slices={donut.map((d) => ({ value: d.value, color: d.color }))}
            unitLabel={t.zonesUnit}
          />
          <div className={s.heroStats}>
            <div>
              <div className={`${s.heroStatNum} ${g.num}`}>{at(okCount)}</div>
              <div className={s.heroStatLabel}>{t.sZonesOk}</div>
            </div>
            <div>
              <div className={`${s.heroStatNum} ${g.num}`} style={{ color: '#f2c879' }}>
                {at(attention)}
              </div>
              <div className={s.heroStatLabel}>{t.sNeedAttention}</div>
            </div>
            <div>
              {/* เลิกโชว์ "ใช้น้ำ L" (ไม่มีเซนเซอร์วัดการไหล) → โชว์อุปกรณ์ที่ทำงานจริงแทน */}
              <div className={`${s.heroStatNum} ${g.num}`}>{at(devicesOn)}</div>
              <div className={s.heroStatLabel}>{t.sDevicesOn}</div>
            </div>
            <div>
              <div className={`${s.heroStatNum} ${g.num}`}>{at(total)}</div>
              <div className={s.heroStatLabel}>{t.totalZones}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
