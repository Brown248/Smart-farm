import { AllMetricsChart, MetricLineChart } from '@/components/charts/LineChart';
import { Icon } from '@/components/common/Icon';
import { METRIC_CFG, pointTimeLabel } from '@/lib/chart';
import type { MetricKey } from '@/lib/chart';
import { csvFilename, downloadCsv, toCsvRows } from '@/lib/csvExport';
import { historyFor } from '@/data/mockSensorHistory';
import { useChartRange } from '@/hooks/useChartRange';
import { useLiveHistory } from '@/hooks/useLiveHistory';
import { useI18n } from '@/i18n/useI18n';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';
import { ChartControls, RangeTabs } from './ChartControls';

export interface HistoryChartSectionProps {
  readonly animate: boolean;
}

/**
 * แผงกราฟประวัติ
 *
 * ค่าเริ่มต้นแสดง 4 ค่าพร้อมกันโดยแต่ละเส้นสเกลตามช่วงของตัวเอง
 * และยังสลับไปดูทีละค่าพร้อมแถบช่วงเหมาะสมได้
 */
export function HistoryChart({ animate }: HistoryChartSectionProps) {
  const { t, lang } = useI18n();
  const state = useChartRange();
  /** ป้ายเวลาต่อจุดสำหรับหัว tooltip — ผูก lang + ช่วงที่เลือก (จุดสุดท้าย = ตอนนี้) */
  const timeAt = (index: number, count: number) => pointTimeLabel(index, count, state.range, lang);
  const cfg = state.isAll ? null : METRIC_CFG[state.metric as MetricKey];

  /** ค่าจริงจาก history_data — `null` เมื่อยังไม่ล็อกอิน/ไม่มีข้อมูล (กราฟใช้ mock ต่อ) */
  const live = useLiveHistory(state.range);
  const liveSeries = live.byMetric;

  /**
   * ค่าล่าสุดที่โชว์ตัวใหญ่/ในคำอธิบาย ต้องเป็น "จุดสุดท้ายของเส้นที่วาดจริง"
   * มิเช่นนั้นจะโชว์เลขคงที่ (`METRIC_CFG.current`) ที่ไม่ตรงกับเส้นเลย ทั้งตอน live และ mock
   * ยึดตรรกะเดียวกับกราฟ: มีค่าจริง >1 จุด → ใช้ค่าจริง ไม่งั้น mock (`historyFor`)
   */
  const fmtLatest = (m: MetricKey): string => {
    const ls = liveSeries?.[m];
    const arr = ls && ls.length > 1 ? ls : historyFor(m, state.range);
    const last = arr.length > 0 ? arr[arr.length - 1] : undefined;
    return last === undefined ? METRIC_CFG[m].current : `${Math.round(last)}${METRIC_CFG[m].unit}`;
  };

  /** ชื่อค่าที่กราฟเอาไปใช้ในกล่องค่าตอนชี้ — แปลที่นี่ที่เดียว กราฟไม่ต้องรู้จัก i18n */
  const metricLabels: Record<MetricKey, string> = {
    temp: t[METRIC_CFG.temp.labelKey],
    hum: t[METRIC_CFG.hum.labelKey],
    soil: t[METRIC_CFG.soil.labelKey],
    light: t[METRIC_CFG.light.labelKey],
  };

  const onDownload = () => {
    const key: MetricKey = state.isAll ? 'temp' : (state.metric as MetricKey);
    // ดาวน์โหลดค่าจริงถ้ามี ไม่งั้นค่าจำลอง — ต้องตรงกับที่กราฟแสดง
    const values = liveSeries?.[key] ?? historyFor(key, state.range);
    const csv = toCsvRows(
      ['index', key],
      values.map((v, i) => [i, Math.round(v * 100) / 100]),
    );
    downloadCsv({ filename: csvFilename(state.isAll ? 'all' : key, state.range), csv });
  };

  return (
    <section className={`${g.glass} ${g.section}`} aria-label={t.chartTitle}>
      <ChartControls state={state} onDownload={onDownload} />

      <div className={s.chartValueRow}>
        <span
          className={`${s.chartValue} ${g.num}`}
          style={{ color: cfg ? cfg.color : 'var(--d-ink)' }}
        >
          {state.isAll ? t.mAllCurrent : fmtLatest(state.metric as MetricKey)}
        </span>
        <span className={g.sub}>{state.isAll ? t.latestAll : t.latestPoint}</span>
      </div>

      <div className={s.chartCanvas}>
        {state.isAll ? (
          <AllMetricsChart
            range={state.range}
            label={t.historySubAll}
            metricLabels={metricLabels}
            series={liveSeries ?? undefined}
            timeAt={timeAt}
          />
        ) : (
          <MetricLineChart
            metric={state.metric as MetricKey}
            range={state.range}
            compare={state.compare}
            splitAxis={state.splitAxis}
            latestLabel={t.latestShort}
            bandLabel={t.targetBand}
            metricLabel={metricLabels[state.metric as MetricKey]}
            animate={animate}
            series={liveSeries?.[state.metric as MetricKey]}
            timeAt={timeAt}
          />
        )}
      </div>

      {/*
        โหมด "ทุกค่า" ไม่มีแถบคำอธิบายสีอีกแล้ว — แต่ละช่องมีหัวช่องบอกชื่อค่า หน่วย และค่าล่าสุด
        อยู่ในตัว การมีแถบสรุปซ้ำอีกชั้นคือข้อมูลเดียวกันสองที่ ซึ่งกินพื้นที่โดยไม่เพิ่มอะไร
      */}

      <div className={s.chartFoot}>
        <RangeTabs state={state} />
        {state.compare && !state.isAll ? (
          <div className={s.compareKey}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ width: 16, height: 3, borderRadius: 2, background: cfg?.color }}
                aria-hidden="true"
              />
              {t.thisPeriod}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, borderTop: '3px dashed #79867e' }} aria-hidden="true" />
              {t.prevPeriod}
            </span>
          </div>
        ) : null}
      </div>

      {/* สรุปเทียบช่วงต้องมาจากข้อมูลจริงย้อนหลัง — ยังไม่มีทางคำนวณจริง จึงเป็น empty state
          (เดิมเป็นตัวเลข −12%/+2°C ที่ฝังไว้ปลอมๆ) */}
      {state.compare ? (
        <div className={s.comparePanel}>
          <div className={s.compareInsight}>
            <span style={{ flex: 'none', marginTop: 2 }}>
              <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
            </span>
            <span>{t.cmpNoData}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
