import type { SceneZone, ZoneId, ZoneStatus } from '@shared/zone';
import { ZONE_LABELS } from '@/data/zones';
import { useI18n } from '@/i18n/useI18n';
import { zoneColor, zoneNeedsChip } from '@/lib/status';
import s from './ZonePins.module.css';

export interface ZonePinsProps {
  readonly zones: readonly SceneZone[];
  /** โซนที่กำลังถูกกด — ย่อหมุดลงเล็กน้อยให้รู้สึกว่ากดติด */
  readonly pressedId: ZoneId | null;
  readonly onPick: (id: ZoneId) => void;
  readonly zoneName: (id: ZoneId) => string;
}

/** จังหวะเต้นของหมุดตามสถานะ — วิกฤตเร็วสุด ปกติแค่ลอยขึ้นลงเบาๆ */
function pinAnimation(status: ZoneStatus, index: number): string {
  if (status === 'critical') return 'fsPulse 1.1s ease-in-out infinite';
  if (status === 'low') return 'fsPulse 1.8s ease-in-out infinite';
  return `fsBob 3.6s ease-in-out ${index * 0.45}s infinite`;
}

export function ZonePins({ zones, pressedId, onPick, zoneName }: ZonePinsProps) {
  const { t } = useI18n();

  return (
    <>
      {zones.map((z) => (
        <button
          key={`hit-${z.id}`}
          type="button"
          aria-label={zoneName(z.id)}
          className={s.hit}
          style={{
            left: z.box[0] + '%',
            top: z.box[1] + '%',
            width: z.box[2] + '%',
            height: z.box[3] + '%',
          }}
          onClick={() => onPick(z.id)}
        />
      ))}

      {zones.map((z, i) => {
        const color = zoneColor(z.status);
        const showChip = zoneNeedsChip(z.status);
        const ripple = z.status === 'critical';
        return (
          <div
            key={`pin-${z.id}`}
            aria-hidden="true"
            className={s.pin}
            style={{
              left: z.dot[0] + '%',
              top: z.dot[1] + '%',
              transform: `translate(-50%, -50%) scale(${pressedId === z.id ? 0.84 : 1})`,
            }}
          >
            <span
              className={s.pop}
              style={{
                animation: `fsPop .5s cubic-bezier(.34,1.56,.64,1) ${i * 0.07}s backwards`,
              }}
            >
              <span className={s.beat} style={{ animation: pinAnimation(z.status, i) }}>
                {ripple ? (
                  <span
                    className={s.ripple}
                    style={{
                      border: `2px solid ${color}`,
                      animation: `fsPinRip ${z.status === 'critical' ? '1.3s' : '2.2s'} ease-out infinite`,
                    }}
                  />
                ) : null}
                <span
                  className={s.dot}
                  style={{
                    color,
                    background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 58%), ${color}`,
                  }}
                />
              </span>
            </span>

            {showChip ? (
              <span
                className={s.chip}
                style={{
                  border: `2px solid ${color}`,
                  animation: `fsSlide .35s ease-out ${i * 0.07}s backwards`,
                }}
              >
                {t[ZONE_LABELS[z.id].name]} {Math.round(z.soil)}%
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
