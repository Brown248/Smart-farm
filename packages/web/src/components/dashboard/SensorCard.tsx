import { RingGauge } from '@/components/charts/RingGauge';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icon } from '@/components/common/Icon';
import { DASH_BG, DASH_COLOR } from '@/data/dashboard';
import type { DashLevel, SensorDef } from '@/data/dashboard';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import { clamp } from '@/lib/format';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

/**
 * ที่มาของเลขบนใบนี้ — 'stale' = เคยเป็นของจริงแต่เซนเซอร์หยุดส่งแล้ว (ดู SENSOR_STALE_MS)
 * ต้องแยกจาก 'sim' ให้ชัด: 'sim' คือยังไม่ได้ต่อ (ปกติ) · 'stale' คือของเสีย ต้องไปดูหน้างาน
 */
export type SensorSource = 'live' | 'sim' | 'stale';

// CSS Modules คืน `string | undefined` (คลาสหายไปเงียบๆ ได้ — `cssPairing.test.ts` เป็นตัวจับ)
const srcClass = (src: SensorSource): string | undefined =>
  src === 'live' ? s.senSrcLive : src === 'stale' ? s.senSrcStale : s.senSrcSim;

const LEVEL_CHIP: Readonly<Record<DashLevel, TextKey>> = {
  normal: 'stNormal',
  warn: 'stWatch',
  crit: 'lgCrit',
};

/** สีตัวอักษรของบรรทัด "ต้องทำอะไร" ตามระดับความรุนแรง */
const ADVICE_INK: Readonly<Record<DashLevel, string>> = {
  normal: '#3f4d46',
  warn: 'var(--d-warn-ink)',
  crit: '#a8302b',
};

export interface SensorCardProps {
  readonly def: SensorDef;
  readonly value: number;
  /** ตำแหน่งบนวงแหวน 0–100 */
  readonly percent: number;
  readonly level: DashLevel;
  /** ข้อความเสริมท้ายค่าหลัก เช่น "· 61% RH" */
  readonly secondary?: string | undefined;
  /**
   * ค่าค้างจริงไหม — แยกจาก `def.stale` เพราะ `def` เป็นค่าตั้งต้นจากต้นแบบ
   * เซนเซอร์ที่ยิงค่ามาจริงต้องไม่ถูกเรียกว่าค่าค้างแม้ต้นแบบจะตั้งไว้อย่างนั้น
   */
  readonly stale: boolean;
  /**
   * เลขบนใบนี้มาจากไหน — `undefined` = ไม่ต้องติดป้าย (ทั้งหน้าเป็นข้อมูลจำลองอยู่แล้ว)
   * ติดเฉพาะตอนบางใบจริงบางใบจำลอง ซึ่งเป็นตอนที่คนดูแยกไม่ออก
   */
  readonly source?: SensorSource | undefined;
  /** จุดของเส้นแนวโน้มย่อ — ค่าจริงถ้ามี ไม่งั้นเป็นชุดของต้นแบบใน `def.spark` */
  readonly spark: readonly number[];
  readonly animate: boolean;
  readonly onOpenThreshold: () => void;
  readonly onRetry: () => void;
}

/**
 * การ์ดค่าเซนเซอร์หนึ่งใบ
 * ทุกใบต้องมี **บรรทัดบอก "ต้องทำอะไร"** ไม่ใช่แสดงตัวเลขเปล่า (กฎเหล็กข้อ 5)
 */
export function SensorCard({
  def,
  value,
  percent,
  level,
  secondary,
  stale,
  source,
  spark,
  animate,
  onOpenThreshold,
  onRetry,
}: SensorCardProps) {
  const { t } = useI18n();
  const chipKey = level === 'normal' ? def.okChipKey : LEVEL_CHIP[level];

  return (
    <div
      role="group"
      aria-label={t[def.labelKey]}
      className={`${g.glass} ${g.lift} ${s.senCard}`}
      style={
        level === 'normal'
          ? undefined
          : {
              borderColor: DASH_COLOR[level],
              boxShadow: `var(--d-glass-shadow), 0 0 0 4px ${DASH_BG[level]}`,
            }
      }
    >
      <div className={s.senTop}>
        <span className={s.senIconWrap} style={{ background: def.iconBg }}>
          <Icon name={def.icon} size={16} color={def.color} />
        </span>
        <span className={s.senLabel}>{t[def.labelKey]}</span>
        <button
          type="button"
          className={s.senThBtn}
          aria-label={`${t.setThreshold} — ${t[def.labelKey]}`}
          title={`${t.setThreshold} — ${t[def.labelKey]}`}
          onClick={onOpenThreshold}
        >
          <Icon name="sliders" size={15} strokeWidth={1.8} />
        </button>
        {/* badge สุขภาพเซนเซอร์ */}
        <span
          className={s.senStatusDot}
          aria-hidden="true"
          style={{
            background: DASH_COLOR[level],
            boxShadow: `0 0 0 3px ${DASH_BG[level]}`,
            ...(level !== 'normal' && animate
              ? { animation: 'sy-pulse 2s ease-in-out infinite' }
              : {}),
          }}
        />
      </div>

      {source ? (
        <span
          className={[s.senSrc, srcClass(source)].join(' ')}
          title={source === 'live' ? t.liveTag : source === 'stale' ? t.staleTagHint : t.simTagHint}
        >
          {source === 'live' ? t.liveTag : source === 'stale' ? t.staleTag : t.simTag}
        </span>
      ) : null}
      {stale ? (
        <div className={s.stalePill}>
          <Icon name="clock" size={12} strokeWidth={2.2} />
          {t.stale}
        </div>
      ) : null}

      <div className={s.senBody}>
        <div className={s.senValues}>
          <div className={s.senValueRow}>
            <span className={`${s.senValue} ${g.num}`}>{value}</span>
            <span className={s.senUnit}>{def.unit}</span>
            {secondary ? <span className={s.senSecond}>{secondary}</span> : null}
          </div>
          <span
            className={s.senChip}
            style={{
              color: level === 'normal' ? 'var(--d-ok-ink)' : DASH_COLOR[level],
              background: DASH_BG[level],
            }}
          >
            {t[chipKey]}
          </span>
          <div className={s.senAdvice} style={{ color: ADVICE_INK[level] }}>
            <span
              className={s.senAdviceDot}
              aria-hidden="true"
              style={{ background: DASH_COLOR[level] }}
            />
            {t[def.adviceKey]}
          </div>
        </div>
        <RingGauge percent={clamp(percent, 0, 100)} color={def.color} />
      </div>

      <Sparkline color={def.color} data={spark} animate={animate} />

      {stale ? (
        <div className={s.senRetryRow}>
          <span className={s.senRetryText}>{t.errReading}</span>
          <button type="button" className={s.senRetryBtn} aria-label={t.retry} onClick={onRetry}>
            <Icon name="refresh" size={13} strokeWidth={2.2} />
            {t.retry}
          </button>
        </div>
      ) : null}
    </div>
  );
}
