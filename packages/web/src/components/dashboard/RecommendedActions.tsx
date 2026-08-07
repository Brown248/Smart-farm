import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import { LEVEL_COLOR } from '@/lib/recommendations';
import type { Recommendation } from '@/lib/recommendations';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

export interface RecommendedActionsProps {
  /** สร้างจากค่าเซนเซอร์จริง เรียงตามความเร่งด่วนมาแล้ว */
  readonly actions: readonly Recommendation[];
  /**
   * กดการ์ดแล้วทำอะไร — รับเป็น prop เพราะปลายทาง (ชลประทาน/ปฏิทิน) ยังไม่ได้ทำ
   * ต้นแบบใช้ `<Link>` ตรงไปหน้านั้น เราเปลี่ยนเป็นปุ่มที่ขึ้น toast แทน
   * จะได้ไม่มีปุ่มพาไปหน้าเปล่า (กฎข้อ 7.5) — พอทำหน้าเหล่านั้นเสร็จค่อยส่ง navigate เข้ามา
   */
  readonly onAction: (action: Recommendation) => void;
}

/**
 * ส่วนที่เด่นที่สุดของหน้า — "ตอนนี้ควรทำอะไร"
 * เลข 1/2/3 บอกลำดับความเร่งด่วน และสีของเลขบอกระดับ (ปกติ/เตือน/วิกฤต)
 * ทุกรายการกดแล้วมีอะไรเกิดขึ้นจริง
 */
export function RecommendedActions({ actions, onAction }: RecommendedActionsProps) {
  const { t } = useI18n();

  return (
    <section className={`${g.glass} ${g.section}`} aria-label={t.actTitle}>
      <div className={s.actHead}>
        <span className={s.actBadge} aria-hidden="true">
          <Icon name="bulb" size={18} color="#dcead9" strokeWidth={1.9} />
        </span>
        <h2 className={g.h2}>{t.actTitle}</h2>
        <span className={`${s.actCount} ${g.num}`}>{actions.length}</span>
        <span className={g.sub} style={{ marginLeft: 'auto' }}>
          {t.actSub}
        </span>
      </div>

      {actions.length === 0 ? (
        <p className={g.sub} style={{ margin: '2px 0 0' }}>
          {t.actNone}
        </p>
      ) : (
        <ol className={s.actList} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {actions.map((a, i) => {
            const color = LEVEL_COLOR[a.level];
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={s.actCard}
                  style={{ borderLeft: `4px solid ${color}` }}
                  onClick={() => onAction(a)}
                >
                  <span className={`${s.actRank} ${g.num}`} style={{ background: color }}>
                    {i + 1}
                  </span>
                  <span
                    className={s.actIcon}
                    style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                  >
                    <Icon name={a.icon} size={17} color={color} />
                  </span>
                  <span className={s.actText}>
                    <span className={s.actTitle}>{t[a.titleKey]}</span>
                    <span className={s.actWhy}>
                      {t[a.whyKey]}
                      {a.zoneLetter ? ` · ${t.zoneLetterPrefix}${a.zoneLetter}` : ''}
                    </span>
                  </span>
                  <span
                    className={s.actCta}
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 10%, transparent)`,
                    }}
                  >
                    {t[a.ctaKey]}
                    <Icon name="arrowRight" size={14} strokeWidth={2.2} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
