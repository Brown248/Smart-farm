import { deviceRunning } from '@shared/device';
import type { Device } from '@shared/device';
import { FAN_POSITIONS, PIPE_DOTS, PUMP_SHIMMER } from '@/data/bulbs';
import s from './effects.module.css';

export interface DeviceEffectsProps {
  readonly devices: readonly Device[];
}

/**
 * เอฟเฟกต์ที่ผูกกับอุปกรณ์จริง: พัดลมที่หมุนอยู่ + ลมพัด + ละอองน้ำจากปั๊ม
 * ใช้ `deviceRunning` เพื่อให้เห็นผลทันทีที่กดสั่ง (ระหว่าง pending) เหมือนต้นแบบ
 */
export function DeviceEffects({ devices }: DeviceEffectsProps) {
  const runningFans = devices.filter((d) => FAN_POSITIONS[d.id] && deviceRunning(d));
  const pump = devices.find((d) => d.id === 'pump');
  const pumpOn = pump ? deviceRunning(pump) : false;

  return (
    <>
      {runningFans.map((d) => {
        const pos = FAN_POSITIONS[d.id];
        if (!pos) return null;
        return (
          <div
            key={`fan-${d.id}`}
            aria-hidden="true"
            className={s.fanGlow}
            style={{ left: pos[0] + '%', top: pos[1] + '%', width: pos[2] + '%' }}
          />
        );
      })}

      {runningFans.flatMap((d, i) => {
        const pos = FAN_POSITIONS[d.id];
        if (!pos) return [];
        const [fx, fy, fs] = pos;
        return (
          [
            [-0.7, -0.15, 0],
            [-0.9, 0.2, 0.7],
          ] as const
        ).map(([ox, oy, dl]) => (
          <span
            key={`wind-${d.id}-${dl}`}
            aria-hidden="true"
            className={s.windStreak}
            style={{
              left: fx + ox * fs + '%',
              top: fy + oy * fs + '%',
              width: (fs > 6 ? 34 : 24) + 'px',
              animation: `fsWind ${1.7 + i * 0.2}s ease-in ${dl + i * 0.3}s infinite`,
            }}
          />
        ));
      })}

      {pumpOn ? (
        <div
          aria-hidden="true"
          className={s.pumpShimmer}
          style={{
            left: PUMP_SHIMMER.left + '%',
            top: PUMP_SHIMMER.top + '%',
            width: PUMP_SHIMMER.width + '%',
          }}
        />
      ) : null}

      {pumpOn
        ? PIPE_DOTS.map((p) => (
            <span
              key={`pipe-${p.left}-${p.delay}`}
              aria-hidden="true"
              className={s.pipeDot}
              style={{
                left: p.left,
                top: p.top,
                animation: `fsPipe ${p.dur} ease-out ${p.delay} infinite`,
              }}
            />
          ))
        : null}
    </>
  );
}
