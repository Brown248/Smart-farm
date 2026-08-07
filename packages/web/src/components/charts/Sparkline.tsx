import { useId } from 'react';

export interface SparklineProps {
  readonly color: string;
  readonly data: readonly number[];
  readonly animate: boolean;
}

/** ความยาวเส้นโดยประมาณ ใช้เป็นระยะ dash ให้ animation ลากเส้นได้เต็มเส้นพอดี */
const DRAW_LEN = 260;

/** เส้นแนวโน้มย่อใต้การ์ดเซนเซอร์ */
export function Sparkline({ color, data, animate }: SparklineProps) {
  // id ต้องมาจาก useId ไม่ใช่จากค่าข้อมูล — สองเส้นที่ข้อมูลบังเอิญเหมือนกัน
  // จะได้ id ซ้ำ แล้ว gradient ตัวหลังจะไปทับตัวแรก ทำให้สีพื้นใต้เส้นผิด
  const gid = useId();
  const W = 120;
  const H = 26;
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map<[number, number]>((v, i) => [
    (i * W) / (data.length - 1),
    H - 3 - ((H - 6) * (v - min)) / span,
  ]);
  const last = pts[pts.length - 1];
  const area = `M0,${H} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${W},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        width: '100%',
        height: '28px',
        display: 'block',
        marginTop: '4px',
        overflow: 'visible',
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.42 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        strokeDasharray={DRAW_LEN}
        style={{
          stroke: color,
          // ระยะ dash กับจุดเริ่มของ animation ต้องเท่ากัน ไม่งั้นเส้นจะโผล่ทั้งเส้นแทนที่จะค่อยๆ ลาก
          ...(animate
            ? {
                ['--draw-len' as string]: String(DRAW_LEN),
                animation: 'sy-draw 1s ease .15s both',
              }
            : { strokeDashoffset: 0 }),
        }}
      />
      {last ? <circle cx={last[0]} cy={last[1]} r={2.8} style={{ fill: color }} /> : null}
    </svg>
  );
}
