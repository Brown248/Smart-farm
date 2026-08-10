import { deviceName } from '@/lib/deviceLabel';
import { useFarmState } from '@/state/FarmStateProvider';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from './Icon';
import s from './EstopDefiedAlert.module.css';

/**
 * "กดหยุดฉุกเฉินแล้วแต่อุปกรณ์ยังไม่หยุด"
 *
 * กรณีที่แย่ที่สุดที่แอปนี้ทำให้เกิดได้คือผู้ใช้กดหยุดฉุกเฉิน เห็นจอบอกว่าปิดหมด แล้วเดินเข้าโรงเรือน
 * ทั้งที่พัดลมยังหมุนอยู่ — provider จึงไม่ซ่อนความจริงอีกต่อไป (`estopDefied`) และตัวนี้เตือนแรง
 *
 * อ่านสถานะจาก context เอง **ทุกหน้าที่แสดง estop วางตัวนี้ได้เลยโดยไม่ต้องส่ง prop**
 * เพื่อให้ไม่มีทางที่หน้าใดหน้าหนึ่งลืมเตือน (เป็นบั๊กตระกูลที่โปรเจกต์นี้เจอมาแล้วหลายรอบ)
 * ว่าง = ไม่ render อะไรเลย
 */
export function EstopDefiedAlert({ className }: { readonly className?: string | undefined }) {
  const { t } = useI18n();
  const { estopDefied, devices } = useFarmState();
  if (estopDefied.length === 0) return null;

  // ใช้ `deviceName` ตัวเดียวกับที่ toast/control log ใช้ — ชื่อจะได้ตรงกันทุกที่ เดินไปหาถูกตัว
  const names = estopDefied
    .flatMap((id) => {
      const dev = devices.find((x) => x.id === id);
      return dev ? [deviceName(dev, t)] : [];
    })
    .join(' · ');

  return (
    <div className={className ? `${s.box} ${className}` : s.box} role="alert">
      <Icon name="alert" size={18} color="var(--d-crit)" strokeWidth={2.2} />
      <span className={s.text}>
        <span className={s.title}>{t.estopDefiedTitle}</span>
        {t.estopDefied(names)}
      </span>
    </div>
  );
}
