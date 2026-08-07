import type { SceneZone } from '@shared/zone';
import s from './effects.module.css';

export interface WaterEffectsProps {
  readonly zones: readonly SceneZone[];
}

/**
 * เอฟเฟกต์โซนที่กำลังรดน้ำ: ดินเข้มขึ้น + ผิวน้ำวาว + วงคลื่น + ประกายละออง
 * ตำแหน่งคำนวณจาก `box` ของโซนตรงๆ ตามสูตรในต้นแบบ
 */
export function WaterEffects({ zones }: WaterEffectsProps) {
  const watering = zones.filter((z) => z.status === 'watering');

  return (
    <>
      {watering.map((z) => {
        const cx = z.box[0] + z.box[2] / 2;
        const cy = z.box[1] + z.box[3] * 0.55;
        const style = {
          left: cx + '%',
          top: cy + '%',
          width: z.box[2] * 0.92 + '%',
          height: z.box[3] * 0.7 + '%',
        };
        return <div key={`wet-${z.id}`} aria-hidden="true" className={s.waterDark} style={style} />;
      })}

      {watering.map((z) => {
        const cx = z.box[0] + z.box[2] / 2;
        const cy = z.box[1] + z.box[3] * 0.55;
        return (
          <div
            key={`shine-${z.id}`}
            aria-hidden="true"
            className={s.waterShimmer}
            style={{
              left: cx + '%',
              top: cy + '%',
              width: z.box[2] * 0.92 + '%',
              height: z.box[3] * 0.7 + '%',
            }}
          />
        );
      })}

      {watering.flatMap((z, i) => {
        const cx = z.box[0] + z.box[2] / 2;
        const cy = z.box[1] + z.box[3] * 0.55;
        const w = z.box[2] * 0.8;
        const h = z.box[3] * 0.55;
        return [0, 1.1].map((dl) => (
          <div
            key={`ripple-${z.id}-${dl}`}
            aria-hidden="true"
            className={s.zoneRipple}
            style={{
              left: cx - w / 2 + '%',
              top: cy - h / 2 + '%',
              width: w + '%',
              height: h + '%',
              animation: `fsZoneRip 2.2s ease-out ${dl + i * 0.4}s infinite`,
            }}
          />
        ));
      })}

      {watering.flatMap((z, i) => {
        const cx = z.box[0] + z.box[2] / 2;
        const cy = z.box[1] + z.box[3] * 0.55;
        return (
          [
            [-0.28, -0.1, 0],
            [0.22, 0.14, 0.9],
          ] as const
        ).map(([ox, oy, dl]) => (
          <span
            key={`spark-${z.id}-${dl}`}
            aria-hidden="true"
            className={s.sparkDot}
            style={{
              left: cx + ox * z.box[2] + '%',
              top: cy + oy * z.box[3] + '%',
              animation: `fsSparkle 1.9s ease-in-out ${dl + i * 0.5}s infinite`,
            }}
          />
        ));
      })}
    </>
  );
}
