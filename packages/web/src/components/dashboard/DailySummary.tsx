import { useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { useClock } from '@/hooks/useClock';
import { dateShortBangkok } from '@/lib/format';
import { useI18n } from '@/i18n/useI18n';
import { useFarmState } from '@/state/FarmStateProvider';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

/**
 * สรุปประจำวัน สลับดูรายวัน/รายสัปดาห์ได้
 *
 * ทุกตัวเลข derive จากสถานะจริงใน `FarmStateProvider` (climate · zones · watering)
 * เดิมเป็นข้อความตายที่ฝังเลขปลอม (31°C · รด 3 โซน · ใช้น้ำ 8,600 ล.) กับวันที่ค้าง —
 * รายสัปดาห์ยังไม่มีข้อมูลย้อนหลังจริง จึงเป็น empty state ไม่ใช่ตัวเลขปลอม
 */
export function DailySummary() {
  const { t, lang } = useI18n();
  const { climate, zones } = useFarmState();
  const now = useClock();
  const [range, setRange] = useState<'day' | 'week'>('day');
  const isDay = range === 'day';

  const total = zones.length;
  const okCount = zones.filter((z) => z.status === 'ok').length;
  const watchCount = zones.filter((z) => z.status === 'low').length;
  const critCount = zones.filter((z) => z.status === 'critical').length;
  const body = isDay
    ? t.dailyBody(Math.round(climate.temp), Math.round(climate.rh), okCount, total)
    : t.dailyWeekEmpty;

  return (
    <section className={s.daily} aria-label={t.dailyTitle}>
      <span className={s.dailyIcon} aria-hidden="true">
        <Icon name="check" size={23} color="#dcead9" />
      </span>
      <div style={{ flex: 1 }}>
        <div className={s.dailyHead}>
          <h2 className={g.h2}>{isDay ? t.dailyTitle : t.dailyTitleWeek}</h2>
          {/* วันที่จริง (เวลาไทย) เฉพาะมุมมองรายวัน — รายสัปดาห์เป็น empty state ยังไม่มีช่วงย้อนหลังจริง */}
          {isDay ? <span className={s.dailyDate}>{dateShortBangkok(now, lang)}</span> : null}
          {/* aria-label เติมชื่อการ์ดนำหน้า เพราะ "วัน"/"สัปดาห์" ชนกับปุ่มช่วงเวลาของกราฟ
              ที่อยู่หน้าเดียวกัน — ข้อความที่ตาเห็นยังเหมือนเดิม */}
          <div className={s.dailySeg} role="group" aria-label={t.dailyTitle}>
            <button
              type="button"
              aria-pressed={isDay}
              aria-label={`${t.dailyTitle} — ${t.rDay}`}
              className={[s.rangeBtn, isDay ? s.rangeBtnOn : null].filter(Boolean).join(' ')}
              onClick={() => setRange('day')}
            >
              {t.rDay}
            </button>
            <button
              type="button"
              aria-pressed={!isDay}
              aria-label={`${t.dailyTitle} — ${t.rWeek}`}
              className={[s.rangeBtn, !isDay ? s.rangeBtnOn : null].filter(Boolean).join(' ')}
              onClick={() => setRange('week')}
            >
              {t.rWeek}
            </button>
          </div>
        </div>
        <p className={s.dailyBody}>{body}</p>
        <div className={s.dailyChips}>
          <span
            className={s.dailyChip}
            style={{ background: 'var(--d-ok-bg)', color: 'var(--d-ok-ink)' }}
          >
            <span className={s.dailyChipDot} style={{ background: 'var(--d-ok)' }} />
            {t.chipNormal(okCount)}
          </span>
          <span
            className={s.dailyChip}
            style={{ background: 'var(--d-warn-bg)', color: 'var(--d-warn-ink-2)' }}
          >
            <span className={s.dailyChipDot} style={{ background: 'var(--d-warn)' }} />
            {t.chipWatch(watchCount)}
          </span>
          <span
            className={s.dailyChip}
            style={{ background: 'var(--d-crit-bg)', color: 'var(--d-crit-ink)' }}
          >
            <span className={s.dailyChipDot} style={{ background: 'var(--d-crit)' }} />
            {t.chipCrit(critCount)}
          </span>
        </div>
      </div>
    </section>
  );
}
