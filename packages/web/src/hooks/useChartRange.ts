import { useCallback, useMemo, useState } from 'react';
import type { RangeKey, TrendMetric } from '@/lib/chart';

export interface ChartRangeState {
  readonly metric: TrendMetric;
  readonly range: RangeKey;
  /** true = แยกแกนตามหน่วย · false = รวมแกนเดียว */
  readonly splitAxis: boolean;
  readonly compare: boolean;
  /** ดู 4 ค่าพร้อมกัน — เป็นค่าเริ่มต้นของหน้า */
  readonly isAll: boolean;
  readonly setMetric: (m: TrendMetric) => void;
  readonly setRange: (r: RangeKey) => void;
  readonly setSplitAxis: (v: boolean) => void;
  readonly toggleCompare: () => void;
}

/** สถานะของแผงกราฟประวัติ (ค่าที่ดู · ช่วงเวลา · โหมดแกน · เทียบช่วงก่อน) */
export function useChartRange(
  initialMetric: TrendMetric = 'all',
  initialRange: RangeKey = 'day',
): ChartRangeState {
  const [metric, setMetric] = useState<TrendMetric>(initialMetric);
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [splitAxis, setSplitAxis] = useState(true);
  const [compare, setCompare] = useState(false);

  const toggleCompare = useCallback(() => setCompare((v) => !v), []);

  return useMemo(
    () => ({
      metric,
      range,
      splitAxis,
      compare,
      isAll: metric === 'all',
      setMetric,
      setRange,
      setSplitAxis,
      toggleCompare,
    }),
    [metric, range, splitAxis, compare, toggleCompare],
  );
}
