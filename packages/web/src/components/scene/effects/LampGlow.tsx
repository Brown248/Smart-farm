import { BULBS } from '@/data/bulbs';
import s from './effects.module.css';

export interface LampGlowProps {
  readonly show: boolean;
}

/**
 * หลอดไฟ 7 ดวงตอนกลางคืน — ใช้ screen blend + bloom + จังหวะ flicker ตอนติด
 * ตำแหน่งคาลิเบรตกับภาพ art แล้ว (BULBS) ห้ามแก้
 */
export function LampGlow({ show }: LampGlowProps) {
  if (!show) return null;
  return (
    <div className={s.lampWrap} aria-hidden="true" data-effect="lamps">
      {/* วาบอุ่นทั้งฉากตอนไฟติด (เล่นครั้งเดียวตอนเข้ากลางคืน) */}
      <span className={s.lampsOn} aria-hidden="true" />
      {BULBS.map((b, i) => (
        <span
          key={`bulb-${b[0]}-${b[1]}`}
          className={s.bulb}
          style={{
            left: b[0] + '%',
            top: b[1] + '%',
            width: (i % 2 ? 11 : 13) + '%',
            // ติดไล่ทีละดวง (วาบ+บานโต) แล้วกระเพื่อมเบาๆ ต่อเนื่อง
            animation: `fsIgnite 1.3s ease ${i * 0.16}s backwards, fsLamp 7.5s ease-in-out ${
              i * 0.7 + 1.3
            }s infinite`,
          }}
        />
      ))}
      {BULBS.map((b, i) => (
        <span
          key={`pool-${b[0]}-${b[1]}`}
          className={s.pool}
          style={{
            left: b[0] + '%',
            top: Math.min(86, b[1] * 0.9 + 52) + '%',
            // แอ่งแสงบนพื้นขยายรับตามดวงไฟที่ติด (ดีเลย์ตามดวงเดียวกัน)
            animation: `fsPoolGrow 1.5s ease ${i * 0.16 + 0.1}s backwards`,
          }}
        />
      ))}
    </div>
  );
}
