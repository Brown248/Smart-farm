import { useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { LOG_CATS, LOG_CAT_META, VISIBLE_LOGS, filterLogs } from '@/data/mockActivityLog';
import type { DashLogEntry, LogCat } from '@/data/mockActivityLog';
import { useI18n } from '@/i18n/useI18n';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

export interface ActivityLogCardProps {
  readonly entries: readonly DashLogEntry[];
  readonly onQuickAdd: () => void;
}

/** สมุดบันทึกกิจกรรมย่อ — กรองตามหมวดได้ · "ดูทั้งหมด" ขยายในที่ · empty state เมื่อไม่มีรายการ */
export function ActivityLogCard({ entries, onQuickAdd }: ActivityLogCardProps) {
  const { t } = useI18n();
  const [cat, setCat] = useState<LogCat | 'all'>('all');
  const [expanded, setExpanded] = useState(false);

  const filtered = filterLogs(entries, cat);
  const visible = expanded ? filtered : filtered.slice(0, VISIBLE_LOGS);

  return (
    <section className={`${g.glass} ${g.section}`} aria-label={t.logTitle}>
      <div className={s.logHead}>
        <h2 className={g.h2}>{t.logTitle}</h2>
        <button type="button" className={s.logAddBtn} aria-label={t.quickAdd} onClick={onQuickAdd}>
          <Icon name="plus" size={15} strokeWidth={2.1} />
          {t.quickAdd}
        </button>
      </div>

      {/*
        บอกอายุของข้อมูลก่อนที่ผู้ใช้จะลงแรงจด — กฎเหล็กข้อ 6 ห้ามใช้ browser storage
        และ backend ยังไม่มี endpoint เก็บบันทึกให้ · รู้ก่อนดีกว่ารู้ตอนของหาย
      */}
      <div className={s.logTempNote} role="note">
        {t.tempDataNote}
      </div>

      <div className={`${s.tabRow} ${g.hscroll}`} role="group" aria-label={t.logTitle}>
        <button
          type="button"
          aria-pressed={cat === 'all'}
          className={[s.tab, cat === 'all' ? s.tabOn : null].filter(Boolean).join(' ')}
          onClick={() => setCat('all')}
        >
          {t.catAll}
        </button>
        {LOG_CATS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            className={[s.tab, cat === c ? s.tabOn : null].filter(Boolean).join(' ')}
            onClick={() => setCat(c)}
          >
            {t[LOG_CAT_META[c].labelKey]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className={s.logEmpty}>
          <span className={s.logEmptyIcon} aria-hidden="true">
            <Icon name="notebook" size={30} color="#8b9a92" strokeWidth={1.6} />
          </span>
          <div className={s.logEmptyTitle}>{t.emptyLogTitle}</div>
          <div className={s.logEmptyBody}>{t.emptyLogBody}</div>
          <button type="button" className={s.logEmptyCta} onClick={() => setCat('all')}>
            {t.emptyLogCta}
          </button>
        </div>
      ) : (
        <div className={s.logList}>
          {visible.map((entry, i) => {
            const meta = LOG_CAT_META[entry.cat];
            const title = entry.title ?? (entry.titleKey ? t[entry.titleKey] : '');
            const when = entry.meta ?? (entry.metaKey ? t[entry.metaKey] : '');
            return (
              <div key={`${title}-${i}`} className={s.logRow}>
                <div className={s.logRail}>
                  <span className={s.logIconWrap} style={{ background: meta.bg }}>
                    <Icon name={meta.icon} size={16} color={meta.color} />
                  </span>
                  <span className={s.logLine} aria-hidden="true" />
                </div>
                <div className={s.logBody}>
                  <div className={s.logMetaRow}>
                    <span
                      className={s.logCatTag}
                      style={{ color: meta.color, background: meta.bg }}
                    >
                      {t[meta.labelKey]}
                    </span>
                    <span className={s.logMeta}>{when}</span>
                  </div>
                  <div className={s.logTitle}>{title}</div>
                  {entry.photo ? (
                    <div className={s.logPhoto} aria-hidden="true">
                      <Icon name="photo" size={18} color="var(--d-muted)" strokeWidth={1.6} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* "ดูทั้งหมด" ขยายในที่ (ไม่ใช่ปุ่มหลอก) — โผล่เมื่อมีรายการเกินที่ย่อไว้ */}
      {filtered.length > VISIBLE_LOGS ? (
        <button
          type="button"
          className={s.logViewAll}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t.viewLess : t.viewAll}
          <Icon name={expanded ? 'up' : 'arrowRight'} size={15} strokeWidth={2.2} />
        </button>
      ) : null}
    </section>
  );
}
