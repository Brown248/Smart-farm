import { useCallback, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { METRIC_CFG, previousSeries, smoothPath } from '@/lib/chart';
import type { MetricKey, RangeKey } from '@/lib/chart';
import {
  axisExtent,
  axisTicks,
  chartHeightFor,
  combinedExtent,
  nearestIndex,
  panelHeightFor,
  pixelPlot,
  seriesExtent,
  stackedHeight,
  stackedPanelPlot,
  targetBandBox,
  toPoints,
  xAt,
} from '@/lib/chartScale';
import type { Extent, Plot } from '@/lib/chartScale';
import { ALL_SERIES_ORDER, allHistory, historyFor } from '@/data/mockSensorHistory';
import { useElementWidth } from '@/hooks/useElementWidth';
import s from './chart.module.css';

/** ที่ว่างขวาของกราฟแยกช่อง — เผื่อเขียนตัวเลขสูงสุด/ต่ำสุดของแต่ละช่อง */
const PANEL_PAD_RIGHT = 42;

const GRID = '#e4eae6';
const AXIS_INK = '#5f6b64';
const BAND = '#2f9e6e';

/** ตัวเลขบนกราฟ — ทศนิยม 1 ตำแหน่งพอ ค่าเต็มหน่วยไม่ต้องมี .0 */
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** ตัวช่วยใช้ร่วมกันของทั้งสองกราฟ — เส้นตารางแนวนอนจางๆ */
function Grid({ plot, ticks }: { plot: Plot; ticks: readonly { fraction: number }[] }) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick, i) => {
        const y = plot.top + (plot.bottom - plot.top) * tick.fraction;
        return (
          <line
            key={`grid-${i}`}
            x1={plot.padLeft}
            x2={plot.width - plot.padRight}
            y1={y}
            y2={y}
            stroke={GRID}
            strokeWidth={1}
            strokeDasharray={i === ticks.length - 1 ? undefined : '3 5'}
          />
        );
      })}
    </g>
  );
}

interface CursorState {
  readonly index: number;
  readonly x: number;
}

/** แปลงตำแหน่งชี้ → ดัชนีจุด ใช้ร่วมกันทั้งเมาส์และคีย์บอร์ด */
function useCursor(count: number, plot: Plot) {
  const [cursor, setCursor] = useState<CursorState | null>(null);

  const moveTo = useCallback(
    (index: number | null) => {
      if (index === null) {
        setCursor(null);
        return;
      }
      setCursor({ index, x: xAt(index, count, plot) });
    },
    [count, plot],
  );

  const onPointer = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      moveTo(nearestIndex(e.clientX - box.left, count, plot));
    },
    [count, moveTo, plot],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      if (e.key === 'Escape') return moveTo(null);
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      const from = cursor?.index ?? (step > 0 ? -1 : count);
      moveTo(Math.max(0, Math.min(count - 1, from + step)));
    },
    [count, cursor, moveTo],
  );

  return { cursor, onPointer, onKey, clear: () => moveTo(null) };
}

interface TooltipRow {
  readonly label: string;
  readonly value: string;
  readonly color: string;
}

/** กล่องค่าที่โผล่ตอนชี้ — เป็น HTML ไม่ใช่ SVG จะได้ตัดบรรทัด/จัดหน้าได้ตามปกติ */
function Tooltip({
  x,
  width,
  rows,
  time,
}: {
  x: number;
  width: number;
  rows: readonly TooltipRow[];
  time?: string | undefined;
}) {
  const left = Math.max(72, Math.min(width - 72, x));
  return (
    <div className={s.tip} style={{ left }} aria-hidden="true">
      {time ? <span className={s.tipTime}>{time}</span> : null}
      {rows.map((r) => (
        <span key={r.label} className={s.tipRow}>
          <span className={s.tipSwatch} style={{ background: r.color }} />
          <span className={s.tipLabel}>{r.label}</span>
          <span className={s.tipValue}>{r.value}</span>
        </span>
      ))}
    </div>
  );
}

/** ป้ายเวลาใต้กราฟ (แกน X) — เลือกจุด 3-5 จุดกระจายเท่าๆ กัน จัดตำแหน่งให้ตรงกับจุดข้อมูล */
function XAxis({
  plot,
  count,
  timeAt,
}: {
  plot: Plot;
  count: number;
  timeAt?: ((index: number, count: number) => string) | undefined;
}) {
  if (!timeAt || count < 2) return null;
  const n = Math.min(plot.width < 520 ? 3 : 5, count);
  const idxs = [
    ...new Set(Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (count - 1)))),
  ];
  return (
    <div className={s.xAxis} aria-hidden="true">
      {idxs.map((i) => {
        const shift = i === 0 ? '0' : i === count - 1 ? '-100%' : '-50%';
        return (
          <span
            key={i}
            className={s.xTick}
            style={{ left: xAt(i, count, plot), transform: `translateX(${shift})` }}
          >
            {timeAt(i, count)}
          </span>
        );
      })}
    </div>
  );
}

export interface MetricLineChartProps {
  readonly metric: MetricKey;
  readonly range: RangeKey;
  readonly compare: boolean;
  /** true = สเกลตามช่วงค่าจริง · false = แกนเดียว 0–100 */
  readonly splitAxis: boolean;
  readonly latestLabel: string;
  readonly bandLabel: string;
  readonly metricLabel: string;
  readonly animate: boolean;
  /** ค่าจริงจาก history_data — ไม่ส่ง = ใช้ข้อมูลจำลอง (`historyFor`) */
  readonly series?: readonly number[] | undefined;
  /** ป้ายเวลาของจุดที่ index (สำหรับหัว tooltip) — ผู้เรียกรู้ lang/range จึงส่งเป็นฟังก์ชันมา */
  readonly timeAt?: ((index: number, count: number) => string) | undefined;
}

/**
 * กราฟค่าเดียว — แถบช่วงเหมาะสมยาวเต็มความกว้าง · เส้นเทียบช่วงก่อน · ตัวเลขแกนขวา
 * ชี้ (หรือกด ←/→ ตอนโฟกัส) เพื่อดูค่าทีละจุด
 */
export function MetricLineChart({
  metric,
  range,
  compare,
  splitAxis,
  latestLabel,
  bandLabel,
  metricLabel,
  animate,
  series,
  timeAt,
}: MetricLineChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const height = chartHeightFor(width);
  const plot = pixelPlot(width, height, 52);

  // ค่าจริงถ้ามี (ต้องยาวพอ) ไม่งั้นใช้ข้อมูลจำลอง
  const arr = series && series.length > 1 ? series : historyFor(metric, range);
  const cfg = METRIC_CFG[metric];
  const prev = compare ? previousSeries(arr) : null;

  const extent: Extent = prev
    ? splitAxis
      ? combinedExtent(arr, prev)
      : { min: 0, max: 100 }
    : axisExtent(arr, splitAxis);

  const pts = toPoints(arr, extent, plot);
  const { cursor, onPointer, onKey, clear } = useCursor(arr.length, plot);
  const last = pts[pts.length - 1];
  const lastValue = arr[arr.length - 1];
  if (!pts[0] || !last || lastValue === undefined) return null;

  const gid = `sg-${metric}`;
  const band = targetBandBox(metric, extent, plot);
  const drawLen = Math.round(width * 3);
  const active = cursor ? pts[cursor.index] : null;
  const activeValue = cursor ? arr[cursor.index] : undefined;

  return (
    <div className={s.wrap} ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metricLabel} — ${latestLabel} ${fmt(lastValue)}${cfg.unit}`}
        tabIndex={0}
        className={s.svg}
        onPointerMove={onPointer}
        onPointerLeave={clear}
        onBlur={clear}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.color} stopOpacity={0.26} />
            <stop offset="72%" stopColor={cfg.color} stopOpacity={0.04} />
            <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
          </linearGradient>
        </defs>

        <Grid plot={plot} ticks={axisTicks(extent)} />

        {axisTicks(extent).map((tick, i) => (
          <text
            key={`ax-${i}`}
            x={plot.width - plot.padRight + 9}
            y={plot.top + (plot.bottom - plot.top) * tick.fraction + 4}
            className={s.axisText}
            fill={AXIS_INK}
          >
            {Math.round(tick.value)}
            {i === 0 ? cfg.unit : ''}
          </text>
        ))}

        {band.visible ? (
          <g aria-hidden="true">
            <rect
              x={plot.padLeft}
              y={band.y}
              width={plot.width - plot.padLeft - plot.padRight}
              height={band.height}
              rx={6}
              fill={BAND}
              opacity={0.1}
            />
            <line
              x1={plot.padLeft}
              x2={plot.width - plot.padRight}
              y1={band.y}
              y2={band.y}
              stroke={BAND}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
            <line
              x1={plot.padLeft}
              x2={plot.width - plot.padRight}
              y1={band.y + band.height}
              y2={band.y + band.height}
              stroke={BAND}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
            <text
              x={plot.padLeft + 7}
              y={Math.max(band.y - 6, 15)}
              className={s.bandText}
              fill="#2b6b4d"
            >
              {bandLabel}
            </text>
          </g>
        ) : null}

        <path d={smoothPath(pts, true, plot.bottom)} fill={`url(#${gid})`} />

        {prev ? (
          <path
            d={smoothPath(toPoints(prev, extent, plot))}
            fill="none"
            stroke="#79867e"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity={0.75}
          />
        ) : null}

        {/* เส้นข้อมูลหนา 2px — หนากว่านี้เส้นเริ่มกลบรายละเอียดของตัวมันเอง (ยอดแหลม/ร่องแคบหาย) */}
        <path
          d={smoothPath(pts)}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            stroke: cfg.color,
            ...(animate
              ? {
                  strokeDasharray: drawLen,
                  ['--draw-len' as string]: String(drawLen),
                  animation: 'sy-draw 1.1s ease .1s both',
                }
              : undefined),
          }}
        />

        {/* เส้นตั้งตรงจุดที่กำลังชี้ */}
        {active && cursor ? (
          <g aria-hidden="true">
            <line
              x1={cursor.x}
              x2={cursor.x}
              y1={plot.top}
              y2={plot.bottom}
              stroke={cfg.color}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.65}
            />
            <circle cx={active[0]} cy={active[1]} r={11} fill={cfg.color} opacity={0.16} />
            <circle
              cx={active[0]}
              cy={active[1]}
              r={5.5}
              fill="#fff"
              strokeWidth={3}
              style={{ stroke: cfg.color }}
            />
          </g>
        ) : null}

        {/* จุดล่าสุด — ซ่อนตอนกำลังชี้จุดอื่นอยู่ จะได้ไม่มีสองจุดเด่นพร้อมกัน */}
        {cursor ? null : (
          <g>
            <circle cx={last[0]} cy={last[1]} r={13} opacity={0.14} style={{ fill: cfg.color }} />
            <circle
              cx={last[0]}
              cy={last[1]}
              r={7}
              fill="#fff"
              strokeWidth={3}
              style={{ stroke: cfg.color }}
            />
            <circle cx={last[0]} cy={last[1]} r={3} style={{ fill: cfg.color }} />
            <text
              x={Math.min(last[0], plot.width - plot.padRight - 30)}
              y={Math.max(last[1] - 16, 20)}
              textAnchor="middle"
              className={s.lastText}
              style={{ fill: cfg.color }}
            >
              {latestLabel}
            </text>
          </g>
        )}
      </svg>

      {cursor && activeValue !== undefined ? (
        <Tooltip
          x={cursor.x}
          width={width}
          time={timeAt?.(cursor.index, arr.length)}
          rows={[{ label: metricLabel, value: `${fmt(activeValue)}${cfg.unit}`, color: cfg.color }]}
        />
      ) : null}

      <XAxis plot={plot} count={arr.length} timeAt={timeAt} />
    </div>
  );
}

export interface AllMetricsChartProps {
  readonly range: RangeKey;
  readonly label: string;
  readonly metricLabels: Readonly<Record<MetricKey, string>>;
  /** ค่าจริงต่อ metric จาก history_data — ตัวที่ไม่มีในนี้ใช้ข้อมูลจำลองแทน */
  readonly series?: Readonly<Partial<Record<MetricKey, readonly number[]>>> | undefined;
  /** ป้ายเวลาของจุดที่ index (หัว tooltip) */
  readonly timeAt?: ((index: number, count: number) => string) | undefined;
}

/**
 * 4 ค่าพร้อมกัน — **แต่ละเส้นสเกลตามช่วงค่าของตัวเอง**
 * ทำให้เห็นรูปทรงการเปลี่ยนแปลงของทุกค่า แม้หน่วยจะต่างกันคนละสเกล
 * ชี้เพื่อดูค่าจริงของทั้ง 4 เส้นที่จุดเดียวกัน
 */
export function AllMetricsChart({
  range,
  label,
  metricLabels,
  series,
  timeAt,
}: AllMetricsChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  /*
   * แยกช่อง (small multiples) ไม่ใช่ซ้อนเส้น — เหตุผลเต็มอยู่ที่ `lib/chartScale.ts`
   * สรุป: 4 ค่าคนละหน่วยยัดลงแกนเดียวไม่ได้ ถ้าฝืนยัดต้องปลอมแกน แล้วกราฟก็อ่านไม่ได้จริง
   */
  const panelH = panelHeightFor(width);
  const height = stackedHeight(ALL_SERIES_ORDER.length, panelH);
  /** ช่องแรกใช้เป็นตัวอ้างอิงของแกนเวลา (ทุกช่องใช้แกนเวลาชุดเดียวกัน) */
  const plot = stackedPanelPlot(width, height, 0, panelH, PANEL_PAD_RIGHT);
  const lastPanel = stackedPanelPlot(
    width,
    height,
    ALL_SERIES_ORDER.length - 1,
    panelH,
    PANEL_PAD_RIGHT,
  );
  const mock = allHistory(range);
  /*
   * ค่าจริงถ้ามี (ต้องยาวพอ) ไม่งั้นใช้ข้อมูลจำลองราย metric — บาง metric อาจมีจริง
   * บาง metric ยังไม่มี history ต้องผสมได้ทีละเส้น ไม่ใช่ all-or-nothing
   */
  const data: Record<MetricKey, readonly number[]> = {
    temp: series?.temp && series.temp.length > 1 ? series.temp : mock.temp,
    hum: series?.hum && series.hum.length > 1 ? series.hum : mock.hum,
    soil: series?.soil && series.soil.length > 1 ? series.soil : mock.soil,
    light: series?.light && series.light.length > 1 ? series.light : mock.light,
  };
  const count = data.temp.length;
  const { cursor, onPointer, onKey, clear } = useCursor(count, plot);

  return (
    <div className={s.wrap} ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        tabIndex={0}
        className={s.svg}
        onPointerMove={onPointer}
        onPointerLeave={clear}
        onBlur={clear}
        onKeyDown={onKey}
      >
        {ALL_SERIES_ORDER.map((k, i) => {
          const values = data[k];
          const cfg = METRIC_CFG[k];
          const color = cfg.color;
          const panel = stackedPanelPlot(width, height, i, panelH, PANEL_PAD_RIGHT);
          // แกนจริงของค่านี้ (ไม่ใช่ 0–1 ปลอม) → ตัวเลขข้างแกนอ่านแล้วมีความหมาย
          const extent = seriesExtent(values);
          const pts = toPoints(values, extent, panel);
          const last = pts[pts.length - 1];
          const active = cursor ? pts[cursor.index] : null;
          const band = targetBandBox(k, extent, panel);
          const lastValue = values[values.length - 1];
          const gid = `ag-${k}`;
          return (
            <g key={k}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* หัวช่อง: จุดสีบอกตัวตน + ชื่อค่า/หน่วย (ตัวหนังสือใช้สีหมึก ไม่ใช่สีเส้น) */}
              <circle cx={panel.padLeft + 3} cy={panel.top - 9} r={3.5} style={{ fill: color }} />
              <text x={panel.padLeft + 12} y={panel.top - 5} className={s.panelName}>
                {`${metricLabels[k]} · ${cfg.unit}`}
              </text>
              <text
                x={panel.width - panel.padRight}
                y={panel.top - 5}
                textAnchor="end"
                className={s.panelValue}
              >
                {lastValue === undefined ? '—' : `${fmt(lastValue)}${cfg.unit}`}
              </text>

              {/* ช่วงค่าเหมาะสมของค่านี้ — บอกว่า "เท่าไรถึงเรียกว่าปกติ" โดยไม่ต้องจำเกณฑ์เอง */}
              {band.visible ? (
                <rect
                  x={panel.padLeft}
                  y={band.y}
                  width={panel.width - panel.padLeft - panel.padRight}
                  height={band.height}
                  fill={BAND}
                  opacity={0.08}
                  aria-hidden="true"
                />
              ) : null}

              <Grid plot={panel} ticks={axisTicks(extent, [0, 1])} />
              {/* ตัวเลขสูงสุด/ต่ำสุดของช่องนี้ — แกนมีหน่วยจริง ไม่ใช่ 0–1 */}
              <text x={panel.width - panel.padRight + 6} y={panel.top + 4} className={s.panelTick}>
                {fmt(extent.max)}
              </text>
              <text
                x={panel.width - panel.padRight + 6}
                y={panel.bottom + 4}
                className={s.panelTick}
              >
                {fmt(extent.min)}
              </text>

              <path d={smoothPath(pts, true, panel.bottom)} fill={`url(#${gid})`} />
              <path
                d={smoothPath(pts)}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ stroke: color }}
              />

              {/* เส้นชี้ตำแหน่งเวลา — ลากผ่านทุกช่องที่ตำแหน่งเดียวกัน จึงอ่านข้ามค่าได้ */}
              {cursor ? (
                <line
                  aria-hidden="true"
                  x1={cursor.x}
                  x2={cursor.x}
                  y1={panel.top}
                  y2={panel.bottom}
                  stroke="#8c988f"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              ) : null}

              {active ? (
                <circle
                  cx={active[0]}
                  cy={active[1]}
                  r={5}
                  fill="#fff"
                  strokeWidth={2.6}
                  style={{ stroke: color }}
                />
              ) : last ? (
                <>
                  <circle
                    cx={last[0]}
                    cy={last[1]}
                    r={5}
                    fill="#fff"
                    strokeWidth={2.4}
                    style={{ stroke: color }}
                  />
                  <circle cx={last[0]} cy={last[1]} r={2.2} style={{ fill: color }} />
                </>
              ) : null}
            </g>
          );
        })}
      </svg>

      {cursor ? (
        <Tooltip
          x={cursor.x}
          width={width}
          time={timeAt?.(cursor.index, count)}
          rows={ALL_SERIES_ORDER.map((k) => {
            const v = data[k][cursor.index];
            return {
              label: metricLabels[k],
              value: v === undefined ? '—' : `${fmt(v)}${METRIC_CFG[k].unit}`,
              color: METRIC_CFG[k].color,
            };
          })}
        />
      ) : null}

      <XAxis plot={lastPanel} count={count} timeAt={timeAt} />
    </div>
  );
}
