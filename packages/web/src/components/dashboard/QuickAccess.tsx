import { deviceRunning } from '@shared/device';
import { Icon } from '@/components/common/Icon';
import { useFarmState } from '@/state/FarmStateProvider';
import { useI18n } from '@/i18n/useI18n';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

export interface QuickAccessProps {
  readonly onOpenIrrigation: () => void;
  readonly onOpenGreenhouse: () => void;
}

/** การ์ดทางลัดไปโมดูลอื่น — ทุกใบที่มีหน้าจริงต้องกดไปได้ */
export function QuickAccess({ onOpenIrrigation, onOpenGreenhouse }: QuickAccessProps) {
  const { t } = useI18n();

  /*
   * ตัวเลขบนการ์ดต้องมาจากสถานะจริงส่วนกลาง ไม่ใช่เลขฝังตายตัว
   * ปั๊มมีตัวเดียว ไม่มีวาล์วแยกแปลง → รดน้ำทีเดียวครบทุกแปลง (0 หรือครบ 8) ไม่ใช่ "3 แปลง"
   */
  const { zones, devices, watering } = useFarmState();
  const zonesWatering = watering ? zones.length : 0;
  const devicesRunning = devices.filter(deviceRunning).length;

  return (
    <div>
      <h2 className={g.h2} style={{ margin: '2px 0 10px' }}>
        {t.quickTitle}
      </h2>
      <div className={s.quickGrid} role="group" aria-label={t.quickTitle}>
        <button
          type="button"
          className={`${s.quickCard} ${s.quickIrrigation}`}
          onClick={onOpenIrrigation}
        >
          <span className={s.quickBlob} aria-hidden="true" />
          <span className={s.quickHead}>
            <span className={s.quickIcon}>
              <Icon name="drop" size={23} color="#dcead9" />
            </span>
            <span style={{ lineHeight: 1.25, textAlign: 'left' }}>
              <span className={s.quickTitle} style={{ display: 'block' }}>
                {t.irrigationTitle}
              </span>
              <span className={s.quickSub}>{t.irrigationSub}</span>
            </span>
          </span>
          <span className={s.quickStats}>
            <span className={s.quickStat}>
              <span className={`${s.quickStatNum} ${g.num}`}>{zonesWatering}</span>
              <span className={s.quickStatLabel}>{t.zonesWatering}</span>
            </span>
            <span className={s.quickDivider} aria-hidden="true" />
            <span className={s.quickStat}>
              <span className={`${s.quickStatNum} ${g.num}`}>{zones.length}</span>
              <span className={s.quickStatLabel}>{t.totalZones}</span>
            </span>
            <span className={s.quickOpen}>
              {t.open}
              <Icon name="arrowRight" size={15} strokeWidth={2.1} />
            </span>
          </span>
        </button>

        <button
          type="button"
          className={`${s.quickCard} ${s.quickGreenhouse}`}
          onClick={onOpenGreenhouse}
        >
          <span className={s.quickBlob} aria-hidden="true" />
          <span className={s.quickHead}>
            <span className={s.quickIcon}>
              <Icon name="house" size={23} color="#dcead9" />
            </span>
            <span style={{ lineHeight: 1.25, textAlign: 'left' }}>
              <span className={s.quickTitle} style={{ display: 'block' }}>
                {t.climateTitle}
              </span>
              <span className={s.quickSub} style={{ color: '#b7d6d3' }}>
                {t.climateSub}
              </span>
            </span>
          </span>
          <span className={s.quickStats}>
            <span className={s.quickStat}>
              <span className={`${s.quickStatNum} ${g.num}`}>{devicesRunning}</span>
              <span className={s.quickStatLabel} style={{ color: '#b7d6d3' }}>
                {t.ghRunning}
              </span>
            </span>
            <span className={s.quickDivider} aria-hidden="true" />
            <span className={s.quickStat}>
              <span className={`${s.quickStatNum} ${g.num}`}>{devices.length}</span>
              <span className={s.quickStatLabel} style={{ color: '#b7d6d3' }}>
                {t.ghDevices}
              </span>
            </span>
            <span className={s.quickOpen}>
              {t.open}
              <Icon name="arrowRight" size={15} strokeWidth={2.1} />
            </span>
          </span>
        </button>

        <div className={`${g.glass} ${s.soonCard}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className={s.soonIcon} aria-hidden="true">
              <Icon name="solar" size={22} color="var(--d-muted)" />
            </span>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--d-ink)' }}>
                {t.solarTitle}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--d-muted)' }}>{t.solarSub}</div>
            </div>
          </div>
          <span className={s.soonTag}>{t.comingSoon}</span>
        </div>
      </div>
    </div>
  );
}
