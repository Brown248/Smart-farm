import { Icon } from '@/components/common/Icon';
import { METRIC_CFG, RANGE_KEYS } from '@/lib/chart';
import type { RangeKey, TrendMetric } from '@/lib/chart';
import type { ChartRangeState } from '@/hooks/useChartRange';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

/** ค่าเริ่มต้นคือ "ทุกค่ารวม" — ต้องอยู่หัวแถวเสมอ */
const TREND_TABS: readonly TrendMetric[] = ['all', 'soil', 'temp', 'hum', 'light'];

const RANGE_LABEL: Readonly<Record<RangeKey, TextKey>> = {
  hour: 'rHour',
  day: 'rDay',
  week: 'rWeek',
  month: 'rMonth',
  year: 'rYear',
};

export interface ChartControlsProps {
  readonly state: ChartRangeState;
  readonly onDownload: () => void;
}

/** แถบควบคุมกราฟ: เลือกค่า · โหมดแกน · ช่วงเวลา · เทียบช่วงก่อน · ดาวน์โหลด */
export function ChartControls({ state, onDownload }: ChartControlsProps) {
  const { t } = useI18n();

  return (
    <>
      <div className={s.chartHead}>
        <div>
          <h2 className={g.h2}>{t.chartTitle}</h2>
          {/* หัวข้อต้องสอดคล้องกับโหมดที่เลือกอยู่เสมอ */}
          <p className={g.sub} style={{ margin: '3px 0 0' }}>
            {state.isAll ? t.historySubAll : t.historySub}
          </p>
        </div>
        <div className={s.chartActions}>
          <button
            type="button"
            className={[s.chartBtn, state.compare ? s.chartBtnOn : null].filter(Boolean).join(' ')}
            aria-pressed={state.compare}
            onClick={state.toggleCompare}
          >
            <Icon name="compare" size={14} strokeWidth={1.9} />
            {t.compare}
          </button>
          <button type="button" className={s.chartBtn} aria-label={t.download} onClick={onDownload}>
            <Icon name="download" size={14} strokeWidth={1.9} />
            {t.download}
          </button>
        </div>
      </div>

      <div className={`${s.tabRow} ${g.hscroll}`} role="tablist" aria-label={t.chartTitle}>
        {TREND_TABS.map((k) => {
          const on = state.metric === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              className={[s.tab, on ? s.tabOn : null].filter(Boolean).join(' ')}
              onClick={() => state.setMetric(k)}
            >
              <span
                className={s.tabDot}
                aria-hidden="true"
                style={{
                  background:
                    k === 'all'
                      ? 'conic-gradient(var(--d-m-temp),var(--d-m-hum),var(--d-m-soil),var(--d-m-light),var(--d-m-temp))'
                      : METRIC_CFG[k].color,
                }}
              />
              {k === 'all' ? t.mAll : t[METRIC_CFG[k].labelKey]}
            </button>
          );
        })}
      </div>

      <div className={`${s.axisRow} ${g.hscroll}`}>
        <span className={g.sub} style={{ flex: 'none' }}>
          {t.axisMode}
        </span>
        <div className={s.segGroup}>
          <button
            type="button"
            aria-pressed={state.splitAxis}
            className={[s.segBtn, state.splitAxis ? s.segBtnOn : null].filter(Boolean).join(' ')}
            onClick={() => state.setSplitAxis(true)}
          >
            {t.axisSplit}
          </button>
          <button
            type="button"
            aria-pressed={!state.splitAxis}
            className={[s.segBtn, !state.splitAxis ? s.segBtnOn : null].filter(Boolean).join(' ')}
            onClick={() => state.setSplitAxis(false)}
          >
            {t.axisSingle}
          </button>
        </div>
        <span className={s.bandKey}>
          <span className={s.bandSwatch} aria-hidden="true" />
          {t.targetBand}
        </span>
      </div>
    </>
  );
}

export interface RangeTabsProps {
  readonly state: ChartRangeState;
}

/**
 * ปุ่มช่วงเวลา — ชม. / วัน / สัปดาห์ / เดือน / ปี
 *
 * `aria-label` เติมชื่อกราฟนำหน้า เพราะ "วัน" กับ "สัปดาห์" ไปชนกับปุ่มของ
 * การ์ดสรุปประจำวันที่อยู่หน้าเดียวกัน — ผู้ใช้ screen reader จะได้แยกออกว่าปุ่มไหนคุมอะไร
 * ข้อความที่ตาเห็นยังเหมือนต้นแบบทุกตัวอักษร
 */
export function RangeTabs({ state }: RangeTabsProps) {
  const { t } = useI18n();
  return (
    <div className={s.segGroup} role="group" aria-label={t.chartTitle}>
      {RANGE_KEYS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={state.range === r}
          aria-label={`${t.chartTitle} — ${t[RANGE_LABEL[r]]}`}
          className={[s.rangeBtn, state.range === r ? s.rangeBtnOn : null]
            .filter(Boolean)
            .join(' ')}
          onClick={() => state.setRange(r)}
        >
          {t[RANGE_LABEL[r]]}
        </button>
      ))}
    </div>
  );
}
