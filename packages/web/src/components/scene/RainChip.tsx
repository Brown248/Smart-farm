import { useI18n } from '@/i18n/useI18n';
import s from './RainChip.module.css';

export interface RainChipProps {
  readonly show: boolean;
  /** ความสูงของแถบ HUD — วางป้ายไว้ใต้แถบพอดี */
  readonly hudHeight: number;
}

/**
 * โชว์ทุกครั้งที่ฝนตก: "ฝนตกข้างนอก · ไม่กระทบการรดน้ำในโรงเรือน"
 * ฝนโยงกับความชื้นอากาศ → เปิดพัดลม ไม่ใช่การข้ามรอบรดน้ำ (สเปกข้อ 7.8)
 */
export function RainChip({ show, hudHeight }: RainChipProps) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div className={s.chip} style={{ top: hudHeight + 6 + 'px' }} role="status">
      {t.rainChip}
    </div>
  );
}
