export interface DonutSlice {
  readonly value: number;
  readonly color: string;
}

export interface DonutProps {
  readonly slices: readonly DonutSlice[];
  readonly unitLabel: string;
}

/** โดนัทสัดส่วนโซนในการ์ดภาพรวม (วางบนพื้นเขียวเข้ม) */
export function Donut({ slices, unitLabel }: DonutProps) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const total = slices.reduce((a, p) => a + p.value, 0) || 1;

  let acc = 0;
  const arcs = slices
    .filter((p) => p.value > 0)
    .map((p, i) => {
      const frac = p.value / total;
      const seg = C * frac;
      const off = C * acc;
      acc += frac;
      return (
        <circle
          key={i}
          cx={46}
          cy={46}
          r={R}
          fill="none"
          strokeWidth={11}
          strokeDasharray={`${seg - 2.5} ${C - seg + 2.5}`}
          strokeDashoffset={-off}
          strokeLinecap="round"
          transform="rotate(-90 46 46)"
          style={{ stroke: p.color, transition: 'stroke-dasharray .8s ease' }}
        />
      );
    });

  return (
    <svg width={92} height={92} viewBox="0 0 92 92" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx={46} cy={46} r={R} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={11} />
      {arcs}
      <text
        x={46}
        y={44}
        textAnchor="middle"
        fontSize={21}
        fontWeight={700}
        fill="#fff"
        fontFamily="IBM Plex Mono"
      >
        {total}
      </text>
      <text x={46} y={60} textAnchor="middle" fontSize={13} fill="#cfe3d6" fontFamily="Prompt">
        {unitLabel}
      </text>
    </svg>
  );
}
