import { STEAM } from '@/data/bulbs';
import s from './effects.module.css';

export interface SteamProps {
  /** โชว์เมื่อความชื้นอากาศเกิน 80% เท่านั้น */
  readonly show: boolean;
}

/** ไอน้ำลอยขึ้นจาก 3 จุดในโรงเรือนเมื่อความชื้นสูง */
export function Steam({ show }: SteamProps) {
  if (!show) return null;
  return (
    <>
      {STEAM.map((p, i) => (
        <span
          key={`steam-${p[0]}-${p[1]}`}
          aria-hidden="true"
          data-effect="steam"
          className={s.steam}
          style={{
            left: p[0] + '%',
            top: p[1] + '%',
            animation: `fsSteam ${5.5 + i}s ease-in ${i * 1.8}s infinite`,
          }}
        />
      ))}
    </>
  );
}
